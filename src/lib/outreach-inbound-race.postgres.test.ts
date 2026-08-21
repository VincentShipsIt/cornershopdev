import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

const enabled = process.env.OUTREACH_INBOUND_RACE_POSTGRES_TEST === "1";
process.env.OUTREACH_LEGAL_CONTROLLER = "Corner Shop Labs Ltd";
process.env.NEXT_PUBLIC_APP_URL = "https://cornershop.dev";

const suffix = randomUUID();
const safeSuffix = suffix.replaceAll("-", "");
const siteId = `inbound-race-site-${suffix}`;
const slug = `inbound-race-${suffix}`;
const recipient = `owner@${slug}.example.test`;
const inboundProviderId = `inbound-race-recv-${suffix}`;
const initialMessageId = `inbound-race-initial-${suffix}`;
const dispatchId = `inbound-race-dispatch-${suffix}`;
const invitationId = `inbound-race-invitation-${suffix}`;
const triggerName = `inbound_race_trigger_${safeSuffix}`;
const triggerFunction = `inbound_race_function_${safeSuffix}`;
const blockerClassId = 1_381_258_069;
const blockerObjectId = Number.parseInt(safeSuffix.slice(0, 7), 16);
const providerSend = mock(async () => ({
  data: { id: "must-not-send" },
  error: null,
}));

if (enabled) {
  mock.module("server-only", () => ({}));
  mock.module("@/lib/resend", () => ({
    getResend: () => ({ emails: { send: providerSend } }),
    sendBoundedResendEmail: providerSend,
    emailSender: () =>
      "Vincent from Restofrontapp <vincent@send.restofront.com>",
    emailReplyTo: () => "vincent@restofront.com",
  }));
  mock.module("@/lib/resend-receiving", () => ({
    fetchReceivedResendEmail: async () => ({
      id: inboundProviderId,
      from: recipient,
      to: ["vincent@restofront.com"],
      subject: "Re: preview",
      text: "Please stop the follow-up.",
      html: null,
      messageId: `<reply-${safeSuffix}@example.test>`,
      receivedFor: ["vincent@restofront.com"],
      headers: {
        "in-reply-to": `<initial-${safeSuffix}@send.restofront.com>`,
        references: `<initial-${safeSuffix}@send.restofront.com>`,
      },
    }),
  }));
  mock.module("@/lib/operator-alerts", () => ({
    captureOperatorAlert: async () => "delivered" as const,
  }));
}

let db: ReturnType<typeof import("@/lib/db").getDb>;
let recordInbound: typeof import("@/lib/outreach-inbound").recordInboundOutreachMessage;
let sendLeadEmail: typeof import("@/lib/outreach").sendLeadEmail;

describe.skipIf(!enabled)("PostgreSQL inbound suppression race", () => {
  beforeAll(async () => {
    const database = await import("@/lib/db");
    ({ recordInboundOutreachMessage: recordInbound } =
      await import("@/lib/outreach-inbound"));
    ({ sendLeadEmail } = await import("@/lib/outreach"));
    db = database.getDb();

    const site = await db.site.create({
      data: {
        id: siteId,
        slug,
        name: "Inbound race fixture",
        leadContactEmail: recipient,
        sourceUrl: `https://${slug}.example.test/`,
        vertical: "RESTAURANT",
        status: "PREVIEW_READY",
        attributes: {
          leadEligibility: {
            state: "ELIGIBLE",
            evidence: {
              channel_basis: "VERIFIED_WRITTEN_CONSENT",
              recipient,
              controller: "Corner Shop Labs Ltd",
              channel: "EMAIL",
              purpose: "CLAIM_INVITATION_AND_FOLLOW_UP",
              evidence_timestamp: new Date(Date.now() - 60_000).toISOString(),
              evidence_source: `consent:inbound-race-${safeSuffix}`,
            },
            updatedAt: new Date().toISOString(),
            updatedBy: "operator:fixture",
          },
        },
      },
    });
    const review = await db.auditEvent.create({
      data: {
        siteId,
        type: "site.review.completed",
        actor: "operator:fixture",
      },
    });
    await db.outreachMessage.create({
      data: {
        id: initialMessageId,
        idempotencyKey: `lead-outreach:${siteId}:preview_ready`,
        siteId,
        direction: "OUTBOUND",
        providerMessageId: `initial-provider-${suffix}`,
        rfcMessageId: `initial-${safeSuffix}@send.restofront.com`,
        fromAddress: "vincent@send.restofront.com",
        replyToAddress: "vincent@restofront.com",
        toAddress: recipient,
        subject: "Preview ready",
        textBody: "Preview ready",
        template: "preview_ready",
        threadKey: `lead:${siteId}`,
        status: "SENT",
        sentAt: new Date(),
      },
    });
    await db.outreachDispatch.create({
      data: {
        id: dispatchId,
        idempotencyKey: `lead-outreach:${siteId}:preview_ready`,
        siteId,
        template: "preview_ready",
        recipient,
        reviewedAt: review.createdAt,
        status: "SENT",
        requestedBy: "operator:fixture",
      },
    });
    await db.claimInvitation.create({
      data: {
        id: invitationId,
        email: recipient,
        tokenHash: safeSuffix.padEnd(64, "0").slice(0, 64),
        outreachKey: `lead-outreach:${siteId}:follow_up_1`,
        proofMethod: "OPERATOR_APPROVAL",
        approvalEvidenceRef: `outreach-dispatch:${dispatchId}`,
        approvedBy: "operator:fixture",
        approvedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        siteId,
      },
    });

    await db.$executeRawUnsafe(`
      CREATE FUNCTION "${triggerFunction}"() RETURNS trigger AS $race$
      BEGIN
        IF NEW."providerMessageId" = '${inboundProviderId}' THEN
          PERFORM pg_advisory_xact_lock(${blockerClassId}, ${blockerObjectId});
        END IF;
        RETURN NEW;
      END
      $race$ LANGUAGE plpgsql
    `);
    await db.$executeRawUnsafe(`
      CREATE TRIGGER "${triggerName}"
      BEFORE INSERT ON "OutreachMessage"
      FOR EACH ROW EXECUTE FUNCTION "${triggerFunction}"()
    `);
    void site;
  });

  afterAll(async () => {
    if (!db) return;
    await db.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS "${triggerName}" ON "OutreachMessage"`,
    );
    await db.$executeRawUnsafe(
      `DROP FUNCTION IF EXISTS "${triggerFunction}"()`,
    );
    await db.site.deleteMany({ where: { id: siteId } });
  });

  test("an inbound reply that owns the fence suppresses a racing follow-up", async () => {
    let releaseBlocker!: () => void;
    let blockerReady!: () => void;
    const release = new Promise<void>((resolve) => {
      releaseBlocker = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      blockerReady = resolve;
    });
    const blocker = db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`
        DO $blocker$
        BEGIN
          PERFORM pg_advisory_xact_lock(${blockerClassId}, ${blockerObjectId});
        END
        $blocker$
      `);
      blockerReady();
      await release;
    });
    await ready;

    const inbound = recordInbound({
      eventId: `inbound-race-event-${suffix}`,
      occurredAt: new Date(),
      metadata: {
        emailId: inboundProviderId,
        from: recipient,
        to: ["vincent@restofront.com"],
        subject: "Re: preview",
        rfcMessageId: `<reply-${safeSuffix}@example.test>`,
        receivedFor: ["vincent@restofront.com"],
      },
    });
    await waitForAdvisoryWaiter();

    const review = await db.auditEvent.findFirstOrThrow({
      where: { siteId, type: "site.review.completed" },
      orderBy: { createdAt: "desc" },
    });
    const followUp = sendLeadEmail({
      siteId,
      template: "follow_up_1",
      claimUrl: `https://cornershop.dev/claim/${slug}#claim_token=test`,
      to: recipient,
      actor: "operator:fixture",
      expectedReviewedAt: review.createdAt.toISOString(),
      claimInvitationId: invitationId,
      dispatchAuthorization: { dispatchId, attempt: 1 },
    });

    releaseBlocker();
    await blocker;
    await expect(inbound).resolves.toMatchObject({
      handled: true,
      created: true,
      siteId,
    });
    await expect(followUp).rejects.toThrow("already replied");
    expect(providerSend).not.toHaveBeenCalled();
  });
});

async function waitForAdvisoryWaiter(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const rows = await db.$queryRaw<Array<{ waiting: number }>>`
      SELECT COUNT(*)::int AS waiting
      FROM pg_locks
      WHERE locktype = 'advisory'
        AND classid = ${blockerClassId}
        AND objid = ${blockerObjectId}
        AND NOT granted
    `;
    if ((rows[0]?.waiting ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Inbound insert did not reach the advisory-lock barrier");
}
