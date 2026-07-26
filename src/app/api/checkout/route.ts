import { z } from "zod";
import {
  authorizeClaimInvitationForCheckout,
  bindClaimInvitationToCheckout,
  ClaimFlowError,
  recordClaimRejection,
} from "@/lib/claim-invitations";
import { limitClaimCheckout } from "@/lib/rate-limit";
import { isSameOriginMutation } from "@/lib/request-origin";
import { getStripe } from "@/lib/stripe";

const requestSchema = z.object({
  plan: z.enum(["starter", "growth"]),
  siteSlug: z.string().trim().min(2).max(80),
  invitationToken: z
    .string()
    .min(32)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/),
});

export async function POST(request: Request) {
  const rateLimit = await limitClaimCheckout(request);
  if (!rateLimit.success) {
    return Response.json(
      {
        error:
          rateLimit.reason === "unavailable"
            ? "Claim checkout is temporarily unavailable."
            : "Too many claim attempts. Try again later.",
      },
      { status: rateLimit.reason === "unavailable" ? 503 : 429 },
    );
  }
  if (!isSameOriginMutation(request)) {
    return Response.json(
      { error: "Cross-site checkout requests are not allowed." },
      { status: 403 },
    );
  }

  let siteSlug = "unknown";
  try {
    const input = requestSchema.parse(await request.json());
    const { plan, invitationToken } = input;
    siteSlug = input.siteSlug;
    const priceId =
      plan === "starter"
        ? process.env.STRIPE_STARTER_PRICE_ID
        : process.env.STRIPE_GROWTH_PRICE_ID;

    if (!priceId) {
      throw new Error(`Stripe price for the ${plan} plan is not configured`);
    }

    if (!process.env.DATABASE_URL) {
      return Response.json(
        { error: "Claim checkout is temporarily unavailable." },
        { status: 503 },
      );
    }
    const invitation = await authorizeClaimInvitationForCheckout({
      siteSlug,
      token: invitationToken,
    });

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        allow_promotion_codes: true,
        customer_email: invitation.email,
        client_reference_id: siteSlug,
        metadata: {
          siteSlug,
          plan,
          priceId,
          claimInvitationId: invitation.id,
        },
        subscription_data: {
          metadata: {
            siteSlug,
            plan,
            priceId,
            claimInvitationId: invitation.id,
          },
        },
        success_url: `${appUrl}/api/auth/checkout?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/claim/${siteSlug}?checkout=canceled`,
      },
      {
        idempotencyKey: `claim-${invitation.id}-${plan}`,
      },
    );
    await bindClaimInvitationToCheckout({
      invitation,
      stripeCheckoutSessionId: session.id,
    });

    return Response.json({ url: session.url });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: error.issues[0]?.message ?? "Check your details and retry" },
        { status: 400 },
      );
    }
    if (error instanceof ClaimFlowError) {
      await recordClaimRejection({
        siteSlug,
        reason: error.code,
        actor: "claimant:checkout",
      });
      return Response.json(
        { error: error.message },
        { status: error.status },
      );
    }

    // Everything else is ours, not the caller's: an unset price ID, a Stripe
    // outage, a database that will not answer. Returning `error.message` here
    // named our own environment variables to anyone who could POST malformed
    // input, and reported a server fault as a 400 the client could not fix.
    console.error("[checkout] failed", {
      siteSlug,
      error: error instanceof Error ? error.message : "unknown",
    });
    return Response.json(
      { error: "Checkout could not start. Try again in a moment." },
      { status: 500 },
    );
  }
}
