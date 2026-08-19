import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { Webhook } from "svix";

const recordEvent = mock(async () => ({ handled: true, updated: 1 }));
const captureOperatorAlert = mock(async () => "delivered" as const);

mock.module("@/lib/outreach-events", () => ({
  RESEND_OUTREACH_EVENT_TRANSITIONS: {
    "email.failed": { status: "FAILED", from: ["QUEUED", "SENT"] },
  },
  recordResendOutreachEvent: recordEvent,
}));
mock.module("@/lib/operator-alerts", () => ({ captureOperatorAlert }));

const previousDatabaseUrl = process.env.DATABASE_URL;
const previousWebhookSecret = process.env.RESEND_WEBHOOK_SECRET;
const webhookSecret = `whsec_${Buffer.from(
  "test-only-webhook-signing-key",
).toString("base64")}`;
const { POST } = await import("@/app/api/webhooks/resend/route");

describe("Resend webhook signature and delivery status", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgresql://unused-by-mocked-test.invalid/db";
    process.env.RESEND_WEBHOOK_SECRET = webhookSecret;
    recordEvent.mockClear();
    captureOperatorAlert.mockClear();
  });

  afterAll(() => {
    restoreEnvironment("DATABASE_URL", previousDatabaseUrl);
    restoreEnvironment("RESEND_WEBHOOK_SECRET", previousWebhookSecret);
  });

  it("rejects an invalid signature without mutating delivery state", async () => {
    const response = await POST(
      signedRequest({ type: "email.failed" }, "v1,invalid-signature"),
    );

    expect(response.status).toBe(400);
    expect(recordEvent).not.toHaveBeenCalled();
    expect(captureOperatorAlert).not.toHaveBeenCalled();
  });

  it("accepts a valid signature and records a failed delivery", async () => {
    const response = await POST(signedRequest({ type: "email.failed" }));
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toEqual({ received: true, handled: true, updated: 1 });
    expect(recordEvent).toHaveBeenCalledTimes(1);
    expect(recordEvent).toHaveBeenCalledWith({
      eventId: "webhook_message_1",
      eventType: "email.failed",
      occurredAt: expect.any(Date),
      providerMessageId: "resend_message_1",
      taggedOutreachMessageId: "outreach_message_1",
    });
  });

  it("asks Resend to retry a tagged event before its mailbox row is visible", async () => {
    recordEvent.mockResolvedValueOnce({ handled: false, updated: 0 });

    const response = await POST(signedRequest({ type: "email.failed" }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Outreach mailbox reservation is not visible yet",
    });
  });
});

function signedRequest(
  input: { type: string },
  signatureOverride?: string,
): Request {
  const timestamp = new Date();
  const messageId = "webhook_message_1";
  const body = JSON.stringify({
    type: input.type,
    created_at: timestamp.toISOString(),
    data: {
      email_id: "resend_message_1",
      tags: {
        category: "lead_outreach",
        outreach_message_id: "outreach_message_1",
      },
    },
  });
  const signature =
    signatureOverride ??
    new Webhook(webhookSecret).sign(messageId, timestamp, body);

  return new Request("https://cornershop.dev/api/webhooks/resend", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "svix-id": messageId,
      "svix-timestamp": String(Math.floor(timestamp.getTime() / 1_000)),
      "svix-signature": signature,
    },
    body,
  });
}

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
