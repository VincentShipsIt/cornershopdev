import { Webhook } from "svix";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { captureOperatorAlert } from "@/lib/operator-alerts";

export const runtime = "nodejs";

/**
 * Resend's documented webhook envelope. Only the fields this handler reads
 * are declared; unknown event types (opened, clicked, delivery_delayed) are
 * accepted and ignored below rather than rejected, since Resend can add new
 * event types without notice.
 */
const resendEventSchema = z.object({
  type: z.string(),
  created_at: z.string(),
  data: z.object({
    email_id: z.string(),
  }),
});

/**
 * Delivery-status event types this handler updates `OutreachMessage` from.
 * Inbound replies are a separate, not-yet-built event stream — the
 * `INBOUND`/`RECEIVED` enum members exist for it, but no Resend event
 * carries a reply; that lands via a future dedicated inbound-parsing route.
 */
const statusByEventType: Record<string, "SENT" | "DELIVERED" | "BOUNCED" | "COMPLAINED"> = {
  "email.sent": "SENT",
  "email.delivered": "DELIVERED",
  "email.bounced": "BOUNCED",
  "email.complained": "COMPLAINED",
};

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    await captureOperatorAlert({
      kind: "OUTREACH_SEND_FAILURE",
      dedupKey: "webhook-configuration",
      title: "Resend webhook configuration is missing",
      message:
        "A Resend delivery webhook reached the application without a configured signing secret. Restore RESEND_WEBHOOK_SECRET and redeploy.",
      context: { category: "configuration" },
    });
    return Response.json(
      { error: "Resend webhook is not configured" },
      { status: 400 },
    );
  }

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  const rawBody = await request.text();
  let verified: unknown;
  try {
    verified = new Webhook(secret).verify(rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  const parsed = resendEventSchema.safeParse(verified);
  if (!parsed.success) {
    return Response.json({ error: "Malformed webhook payload" }, {
      status: 400,
    });
  }
  const event = parsed.data;

  if (!process.env.DATABASE_URL) {
    await captureOperatorAlert({
      kind: "OUTREACH_SEND_FAILURE",
      dedupKey: "webhook-persistence",
      title: "Resend webhook persistence is unavailable",
      message:
        "A signed Resend webhook could not reach PostgreSQL. Resend will retry; restore database availability before replaying events.",
      context: { category: "database" },
    });
    return Response.json(
      { error: "Webhook persistence is unavailable" },
      { status: 503 },
    );
  }

  const status = statusByEventType[event.type];
  if (!status) {
    // Not a delivery-status event this handler tracks (opened, clicked,
    // delivery_delayed, or a future inbound event) — acknowledge and skip.
    return Response.json({ received: true, handled: false });
  }

  try {
    const result = await getDb().outreachMessage.updateMany({
      where: { providerMessageId: event.data.email_id },
      data: {
        status,
        deliveredAt: status === "DELIVERED" ? new Date() : undefined,
      },
    });
    return Response.json({
      received: true,
      handled: true,
      updated: result.count,
    });
  } catch (error) {
    console.error("[resend-webhook] processing failed", {
      eventType: event.type,
      emailId: event.data.email_id,
      error: error instanceof Error ? error.message : "unknown",
    });
    await captureOperatorAlert({
      kind: "OUTREACH_SEND_FAILURE",
      dedupKey: `${event.type}:${event.data.email_id}`,
      title: "Resend webhook processing failed",
      message:
        "A signed Resend delivery event returned a server failure. Inspect the outreach mailbox, provider status, and application logs.",
      context: { eventType: event.type, emailId: event.data.email_id },
    });
    return Response.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}
