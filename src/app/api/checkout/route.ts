import { z } from "zod";
import { normalizeAccountEmail } from "@/lib/account-email";
import { configuredBillingPlans } from "@/lib/billing-plans";
import { checkoutSessionAction } from "@/lib/checkout-session-policy";
import { isClaimInvitationAuthorized } from "@/lib/claim-authorization";
import {
  createCheckoutReturnToken,
  hashClaimInvitationToken,
} from "@/lib/claim-security";
import { getDb } from "@/lib/db";
import { getStripe } from "@/lib/stripe";

const requestSchema = z.object({
  plan: z.enum(["starter", "growth"]),
  siteSlug: z.string().trim().min(2).max(80),
  email: z.email(),
  claimToken: z.string().trim().min(32).max(512),
});

export async function POST(request: Request) {
  try {
    const { plan, siteSlug, email, claimToken } = requestSchema.parse(
      await request.json(),
    );
    if (!process.env.DATABASE_URL) {
      return Response.json(
        { error: "Claims are temporarily unavailable" },
        { status: 503 },
      );
    }
    const priceId = configuredBillingPlans()[plan].priceId;
    const normalizedEmail = normalizeAccountEmail(email);
    const db = getDb();
    const invitation = await db.claimInvitation.findUnique({
      where: { tokenHash: hashClaimInvitationToken(claimToken) },
      select: {
        id: true,
        email: true,
        expiresAt: true,
        acceptedAt: true,
        stripeCheckoutSessionId: true,
        stripePriceId: true,
        checkoutAttempt: true,
        checkoutReturnExpiresAt: true,
        site: {
          select: {
            slug: true,
            status: true,
            organizationId: true,
          },
        },
      },
    });
    if (
      !invitation ||
      !isClaimInvitationAuthorized(invitation, {
        siteSlug,
        email: normalizedEmail,
      })
    ) {
      return Response.json(
        { error: "This claim invitation is invalid or expired" },
        { status: 403 },
      );
    }

    const stripe = getStripe();
    const staleSessionId = invitation.stripeCheckoutSessionId;
    if (invitation.stripeCheckoutSessionId) {
      const existing = await stripe.checkout.sessions.retrieve(
        invitation.stripeCheckoutSessionId,
      );
      let action = checkoutSessionAction(
        {
          status: existing.status,
          url: existing.url,
          priceId: invitation.stripePriceId,
        },
        priceId,
      );
      if (
        action === "reuse" &&
        (!invitation.checkoutReturnExpiresAt ||
          invitation.checkoutReturnExpiresAt <= new Date())
      ) {
        action = "expire_and_replace";
      }
      if (action === "reuse" && existing.url) {
        return Response.json({ url: existing.url });
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
    const returnToken = createCheckoutReturnToken();
    const returnExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const nextAttempt = invitation.checkoutAttempt + 1;
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        allow_promotion_codes: true,
        customer_email: normalizedEmail,
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
          `&claim_id=${encodeURIComponent(invitation.id)}` +
          `&state=${encodeURIComponent(returnToken.token)}`,
        // Never put the raw claim bearer token in a third-party return URL. A
        // customer who cancels can reopen the original invitation.
        cancel_url: `${appUrl}/claim/${encodeURIComponent(siteSlug)}?checkout=canceled`,
      },
      {
        idempotencyKey: `claim-checkout-${invitation.id}-${nextAttempt}`,
      },
    );

    const bound = await db.claimInvitation.updateMany({
      where: {
        id: invitation.id,
        acceptedAt: null,
        checkoutAttempt: invitation.checkoutAttempt,
        stripeCheckoutSessionId: staleSessionId,
      },
      data: {
        stripeCheckoutSessionId: session.id,
        stripePriceId: priceId,
        checkoutAttempt: nextAttempt,
        checkoutReturnTokenHash: returnToken.tokenHash,
        checkoutReturnExpiresAt: returnExpiresAt,
      },
    });
    if (bound.count !== 1) {
      const winner = await db.claimInvitation.findUnique({
        where: { id: invitation.id },
        select: { stripeCheckoutSessionId: true },
      });
      if (winner?.stripeCheckoutSessionId === session.id && session.url) {
        return Response.json({ url: session.url });
      }
      return Response.json(
        { error: "Checkout changed in another request. Try again." },
        { status: 409 },
      );
    }

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
