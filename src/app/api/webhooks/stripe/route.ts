import type Stripe from "stripe";
import { getDb } from "@/lib/db";
import { CLAIMABLE_STATUSES } from "@/lib/restaurant-claim";
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
    const slug = session.metadata?.restaurantSlug;
    if (slug) {
      // Checkout metadata is attacker-influenced, so a webhook must never flip
      // a restaurant that is already owned. Restricting the WHERE clause to
      // claimable statuses makes this a no-op for anything already claimed,
      // which would otherwise lock the real owner out of re-importing.
      await db.restaurant.updateMany({
        where: { slug, status: { in: CLAIMABLE_STATUSES } },
        data: { status: "CLAIMED" },
      });
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
