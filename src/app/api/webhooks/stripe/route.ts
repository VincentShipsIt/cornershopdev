import type Stripe from "stripe";
import { getDb } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { processStripeWebhookEvent } from "@/lib/stripe-webhook";
import { captureOperatorAlert } from "@/lib/operator-alerts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    await captureOperatorAlert({
      kind: "CHECKOUT_WEBHOOK_FAILURE",
      dedupKey: "webhook-configuration",
      title: "Stripe webhook configuration is missing",
      message:
        "A Stripe webhook reached the application without a configured signing secret. Restore the encrypted parameter and redeploy.",
      context: { category: "configuration" },
    });
    return Response.json(
      { error: "Stripe webhook is not configured" },
      { status: 400 },
    );
  }
  if (!signature) {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
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
    await captureOperatorAlert({
      kind: "CHECKOUT_WEBHOOK_FAILURE",
      dedupKey: "webhook-persistence",
      title: "Stripe webhook persistence is unavailable",
      message:
        "A signed webhook could not reach PostgreSQL. Stripe will retry; restore database availability before replaying events.",
      context: { category: "database" },
    });
    return Response.json(
      { error: "Webhook persistence is unavailable" },
      { status: 503 },
    );
  }

  try {
    const result = await processStripeWebhookEvent(
      event,
      getStripe(),
      getDb(),
    );
    return Response.json({ received: true, persisted: true, result });
  } catch (error) {
    console.error("[stripe-webhook] processing failed", {
      eventId: event.id,
      eventType: event.type,
      error: error instanceof Error ? error.message : "unknown",
    });
    await captureOperatorAlert({
      kind: "CHECKOUT_WEBHOOK_FAILURE",
      dedupKey: `${event.type}:${event.id}`,
      title: "Stripe webhook processing failed",
      message:
        "A signed Stripe event returned a server failure and remains eligible for Stripe retry. Inspect the event ledger, provider status, and application logs.",
      context: { eventId: event.id, eventType: event.type },
    });
    return Response.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}
