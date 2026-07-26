import { z } from "zod";
import { normalizeAccountEmail } from "@/lib/account-email";
import { configuredBillingPlans } from "@/lib/billing-plans";
import { isClaimInvitationAuthorized } from "@/lib/claim-authorization";
import {
  createCheckoutReturnState,
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
    if (invitation.stripePriceId && invitation.stripePriceId !== priceId) {
      return Response.json(
        { error: "This claim already has a checkout in progress" },
        { status: 409 },
      );
    }

    const stripe = getStripe();
    if (invitation.stripeCheckoutSessionId) {
      const existing = await stripe.checkout.sessions.retrieve(
        invitation.stripeCheckoutSessionId,
      );
      if (existing.url) {
        return Response.json({ url: existing.url });
      }
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
    const state = createCheckoutReturnState(invitation.id);
    const session = await stripe.checkout.sessions.create({
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
        `&state=${encodeURIComponent(state)}`,
      // Never put the raw claim bearer token in a third-party return URL. A
      // customer who cancels can reopen the original invitation.
      cancel_url: `${appUrl}/claim/${encodeURIComponent(siteSlug)}?checkout=canceled`,
    }, {
      idempotencyKey: `claim-checkout-${invitation.id}`,
    });

    const bound = await db.claimInvitation.updateMany({
      where: {
        id: invitation.id,
        acceptedAt: null,
        OR: [
          { stripeCheckoutSessionId: null },
          { stripeCheckoutSessionId: session.id },
        ],
      },
      data: {
        stripeCheckoutSessionId: session.id,
        stripePriceId: priceId,
      },
    });
    if (bound.count !== 1) {
      throw new Error("Claim invitation could not be bound to Checkout");
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
