import type Stripe from "stripe";
import { recordClaimRejection } from "@/lib/claim-invitations";
import { getDb } from "@/lib/db";
import {
  claimSite,
  SiteNotClaimableError,
} from "@/lib/site-claim";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) {
    return Response.json(
      { error: "Stripe webhook is not configured" },
      { status: 400 },
    );
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      await request.text(),
      signature,
      secret,
    );
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    return Response.json({ received: true, persisted: false });
  }

  const db = getDb();
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const slug = session.metadata?.siteSlug;
    const claimInvitationId = session.metadata?.claimInvitationId;
    const email = session.customer_details?.email ?? session.customer_email;
    if (slug && (!email || !claimInvitationId)) {
      await recordClaimRejection({
        siteSlug: slug,
        reason: "checkout_metadata_missing",
        actor: "system:stripe-webhook",
        invitationId: claimInvitationId,
      });
    }
    if (slug && email && claimInvitationId) {
      // Stripe routinely delivers this before the browser follows success_url,
      // and may be the only completion signal we ever get if the customer
      // closes the tab. So the webhook performs the whole claim rather than
      // flipping a status: a status without an owner would strand the row in
      // a state the callback can no longer claim, locking the customer out.
      try {
        await db.$transaction((tx) =>
          claimSite(tx, {
            email,
            siteSlug: slug,
            claimInvitationId,
            stripeCheckoutSessionId: session.id,
            stripeCustomerId:
              typeof session.customer === "string" ? session.customer : null,
            stripeSubscriptionId:
              typeof session.subscription === "string"
                ? session.subscription
                : null,
            stripePriceId: session.metadata?.priceId ?? null,
          }),
        );
      } catch (error) {
        if (!(error instanceof SiteNotClaimableError)) throw error;
        await recordClaimRejection({
          siteSlug: slug,
          reason: "checkout_completion_rejected",
          actor: "system:stripe-webhook",
          invitationId: claimInvitationId,
        });
        // Checkout metadata is attacker-influenced, so a slug pointing at
        // somebody else's site is expected here. Acknowledge it: no
        // amount of retrying will make that site claimable.
      }
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object;
    await db.subscription.updateMany({
      where: { stripeSubscriptionId: subscription.id },
      data: { status: "CANCELED" },
    });
  }

  return Response.json({ received: true, persisted: true });
}
