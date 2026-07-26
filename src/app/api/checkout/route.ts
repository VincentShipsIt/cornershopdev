import { z } from "zod";
import { getDb } from "@/lib/db";
import { isClaimable } from "@/lib/site-claim";
import { getStripe } from "@/lib/stripe";

const requestSchema = z.object({
  plan: z.enum(["starter", "growth"]),
  siteSlug: z.string().trim().min(2).max(80),
  email: z.email().optional(),
});

export async function POST(request: Request) {
  try {
    const { plan, siteSlug, email } = requestSchema.parse(
      await request.json(),
    );
    const priceId =
      plan === "starter"
        ? process.env.STRIPE_STARTER_PRICE_ID
        : process.env.STRIPE_GROWTH_PRICE_ID;

    if (!priceId) {
      throw new Error(`Stripe price for the ${plan} plan is not configured`);
    }

    // Fail before taking money for a claim that cannot succeed. This is a
    // courtesy check only — the authoritative, race-free guard runs inside the
    // checkout callback's transaction in `api/auth/checkout`.
    if (process.env.DATABASE_URL) {
      const site = await getDb().site.findUnique({
        where: { slug: siteSlug },
        select: { status: true, organizationId: true },
      });
      if (!site || !isClaimable(site)) {
        return Response.json(
          { error: "This site is not available to claim" },
          { status: 409 },
        );
      }
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      customer_email: email,
      client_reference_id: siteSlug,
      metadata: { siteSlug, plan, priceId },
      subscription_data: {
        metadata: { siteSlug, plan, priceId },
      },
      success_url: `${appUrl}/api/auth/checkout?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/claim/${siteSlug}?checkout=canceled`,
    });

    return Response.json({ url: session.url });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: error.issues[0]?.message ?? "Check your details and retry" },
        { status: 400 },
      );
    }

    // Everything else is ours, not the caller's: an unset price ID, a Stripe
    // outage, a database that will not answer. Returning `error.message` here
    // named our own environment variables to anyone who could POST malformed
    // input, and reported a server fault as a 400 the client could not fix.
    console.error("[checkout] failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return Response.json(
      { error: "Checkout could not start. Try again in a moment." },
      { status: 500 },
    );
  }
}
