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
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Checkout could not start",
      },
      { status: 400 },
    );
  }
}
