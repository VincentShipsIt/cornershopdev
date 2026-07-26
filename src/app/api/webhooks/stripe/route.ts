import type Stripe from "stripe";
import { getDb } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { processStripeWebhookEvent } from "@/lib/stripe-webhook";

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
    // A 2xx response would tell Stripe to stop retrying an event that was
    // never durably recorded.
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
    return Response.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}
