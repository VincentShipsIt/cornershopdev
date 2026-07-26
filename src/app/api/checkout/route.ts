import { cookies } from "next/headers";
import { z } from "zod";
import { configuredBillingPlans } from "@/lib/billing-plans";
import { checkoutSessionAction } from "@/lib/checkout-session-policy";
import {
  authorizeClaimInvitationForCheckout,
  bindClaimInvitationToCheckout,
  ClaimFlowError,
  type CheckoutClaimInvitation,
  recordClaimRejection,
} from "@/lib/claim-invitations";
import {
  CHECKOUT_RETURN_COOKIE,
  createCheckoutReturnToken,
} from "@/lib/claim-security";
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
    if (!process.env.DATABASE_URL) {
      return Response.json(
        { error: "Claim checkout is temporarily unavailable." },
        { status: 503 },
      );
    }

    const priceId = configuredBillingPlans()[plan].priceId;
    const invitation = await authorizeClaimInvitationForCheckout({
      siteSlug,
      token: invitationToken,
    });
    const stripe = getStripe();

    if (invitation.checkoutSessionId) {
      const existing = await stripe.checkout.sessions.retrieve(
        invitation.checkoutSessionId,
      );
      const action = checkoutSessionAction(
        {
          status: existing.status,
          url: existing.url,
          priceId: invitation.stripePriceId,
        },
        priceId,
      );
      if (action === "reuse" && existing.url) {
        return bindReturnCredential(
          invitation,
          existing.id,
          existing.url,
          priceId,
          invitation.checkoutAttempt + 1,
        );
      }
      if (action === "await_provisioning") {
        return Response.json(
          { error: "Payment is complete and the account is being finalized" },
          { status: 409 },
        );
      }
      if (action === "expire_and_replace") {
        await stripe.checkout.sessions.expire(existing.id);
      }
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
    const nextAttempt = invitation.checkoutAttempt + 1;
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        allow_promotion_codes: true,
        customer_email: invitation.email,
        client_reference_id: invitation.id,
        metadata: {
          claimInvitationId: invitation.id,
          siteSlug,
          plan,
        },
        subscription_data: {
          metadata: {
            claimInvitationId: invitation.id,
            siteSlug,
            plan,
          },
        },
        success_url:
          `${appUrl}/api/auth/checkout?session_id={CHECKOUT_SESSION_ID}` +
          `&claim_id=${encodeURIComponent(invitation.id)}`,
        cancel_url: `${appUrl}/claim/${encodeURIComponent(siteSlug)}?checkout=canceled`,
      },
      {
        idempotencyKey: `claim-checkout-${invitation.id}-${nextAttempt}`,
      },
    );
    if (!session.url) throw new Error("Stripe Checkout returned no URL");

    return bindReturnCredential(
      invitation,
      session.id,
      session.url,
      priceId,
      nextAttempt,
    );
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
      return Response.json({ error: error.message }, { status: error.status });
    }

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

async function bindReturnCredential(
  invitation: CheckoutClaimInvitation,
  sessionId: string,
  sessionUrl: string,
  priceId: string,
  checkoutAttempt: number,
): Promise<Response> {
  const returnToken = createCheckoutReturnToken();
  const returnExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await bindClaimInvitationToCheckout({
    invitation,
    stripeCheckoutSessionId: sessionId,
    stripePriceId: priceId,
    checkoutAttempt,
    checkoutReturnTokenHash: returnToken.tokenHash,
    checkoutReturnExpiresAt: returnExpiresAt,
  });

  const cookieStore = await cookies();
  cookieStore.set(CHECKOUT_RETURN_COOKIE, returnToken.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 60,
    path: "/",
  });
  return Response.json({ url: sessionUrl });
}
