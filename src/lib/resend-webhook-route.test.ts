import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { Webhook } from "svix";

const recordEvent = mock(async () => ({ handled: true, updated: 1 }));
const recordAuthEvent = mock(async () => ({ handled: true, updated: 1 }));
const recordClaimEvent = mock(async () => ({ handled: true, updated: 1 }));
const captureOperatorAlert = mock(async () => "delivered" as const);

mock.module("@/lib/outreach-events", () => ({
  RESEND_OUTREACH_EVENT_TRANSITIONS: {
    "email.failed": { status: "FAILED", from: ["QUEUED", "SENT"] },
  },
  recordResendOutreachEvent: recordEvent,
}));
mock.module("@/lib/auth-delivery-events", () => ({
  RESEND_AUTH_EVENT_TRANSITIONS: {
    "email.failed": { status: "FAILED", from: ["PENDING", "SENT"] },
  },
  recordResendAuthEvent: recordAuthEvent,
}));
mock.module("@/lib/claim-delivery-events", () => ({
  RESEND_CLAIM_EVENT_TRANSITIONS: {
    "email.failed": { status: "FAILED", from: ["PENDING", "SENT"] },
  },
  recordResendClaimEvent: recordClaimEvent,
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
    recordAuthEvent.mockClear();
    recordClaimEvent.mockClear();
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

  it("routes tagged authentication failures to the durable auth ledger", async () => {
    const response = await POST(
      signedRequest({ type: "email.failed", category: "auth_magic_link" }),
    );

    expect(response.status).toBe(200);
    expect(recordEvent).not.toHaveBeenCalled();
    expect(recordAuthEvent).toHaveBeenCalledWith({
      eventId: "webhook_message_1",
      eventType: "email.failed",
      occurredAt: expect.any(Date),
      providerMessageId: "resend_message_1",
      taggedAuthMagicLinkId: "auth_magic_link_1",
    });
  });

  it("asks Resend to retry an auth event before its ledger row is visible", async () => {
    recordAuthEvent.mockResolvedValueOnce({ handled: false, updated: 0 });

    const response = await POST(
      signedRequest({ type: "email.failed", category: "auth_magic_link" }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Authentication delivery reservation is not visible yet",
    });
  });

  it("routes tagged claim failures to the durable invitation ledger", async () => {
    const response = await POST(
      signedRequest({ type: "email.failed", category: "claim_invitation" }),
    );

    expect(response.status).toBe(200);
    expect(recordEvent).not.toHaveBeenCalled();
    expect(recordAuthEvent).not.toHaveBeenCalled();
    expect(recordClaimEvent).toHaveBeenCalledWith({
      eventId: "webhook_message_1",
      eventType: "email.failed",
      occurredAt: expect.any(Date),
      providerMessageId: "resend_message_1",
      taggedClaimInvitationId: "claim_invitation_1",
    });
  });

  it("asks Resend to retry a claim event before its ledger row is visible", async () => {
    recordClaimEvent.mockResolvedValueOnce({ handled: false, updated: 0 });

    const response = await POST(
      signedRequest({ type: "email.failed", category: "claim_invitation" }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Claim invitation delivery reservation is not visible yet",
    });
  });
});

function signedRequest(
  input: {
    type: string;
    category?: "lead_outreach" | "auth_magic_link" | "claim_invitation";
  },
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
        category: input.category ?? "lead_outreach",
        ...(input.category === "auth_magic_link"
          ? { auth_magic_link_id: "auth_magic_link_1" }
          : input.category === "claim_invitation"
            ? { claim_invitation_id: "claim_invitation_1" }
            : { outreach_message_id: "outreach_message_1" }),
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
