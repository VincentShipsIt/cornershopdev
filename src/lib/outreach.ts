import { createHash, randomUUID } from "node:crypto";
import "server-only";
import type { OutreachMessage, Prisma } from "@/generated/prisma/client";
import type { OutreachStatus } from "@/generated/prisma/enums";
import { appOrigin } from "@/lib/app-origin";
import { normalizeAccountEmail } from "@/lib/account-email";
import { getDb } from "@/lib/db";
import { buildImportUrls } from "@/lib/import-identity";
import { mutableLeadStatuses } from "@/lib/lead-status";
import { isOperatorReviewCurrent } from "@/lib/operator-lead-status";
import { evaluateLeadOutreachEligibility } from "@/lib/operator-lead-attributes";
import {
  lockClaimInvitationById,
  lockOutreachDelivery,
  lockOutreachDispatchById,
  lockOutreachMessageById,
  lockOutreachMessageByKey,
  lockOutreachSite,
} from "@/lib/outreach-lock";
import {
  isDefinitiveResendRejection,
  isOutreachMessageRetryable,
  PROVIDER_IDEMPOTENCY_WINDOW_MS,
} from "@/lib/outreach-delivery-policy";
import {
  buildOperatorReplyEmail,
  buildOutreachEmail,
  type OutreachTemplateId,
} from "@/lib/outreach-templates";
import {
  normalizeRfcMessageId,
  outboundRfcMessageId,
  outreachThreadKey,
  plusAddressReplyTo,
  replySubject,
} from "@/lib/outreach-thread";
import { sendBoundedResendEmail } from "@/lib/resend";
import { isVerticalOutreachConfigured } from "@/lib/lead-generation/registry";
import {
  GLOBAL_OUTREACH_PAUSE_KEY,
  isOutreachPaused,
  siteOutreachPauseKey,
} from "@/lib/outreach-pause";

export class OutreachError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404 | 409 | 503 = 400,
  ) {
    super(message);
    this.name = "OutreachError";
  }
}

export class OutreachDeliveryUnknownError extends Error {
  constructor() {
    super(
      "Provider acceptance is unknown. The queued mailbox row requires webhook or operator reconciliation.",
    );
    this.name = "OutreachDeliveryUnknownError";
  }
}

export class OutreachTerminalDeliveryError extends OutreachError {
  constructor() {
    super("This outreach stage is terminal and requires operator review.", 503);
    this.name = "OutreachTerminalDeliveryError";
  }
}

export const OUTREACH_DELIVERY_LEASE_MS = 60_000;

/**
 * Re-exported from `@/lib/app-origin` (see that module for why it lives on
 * its own) so existing importers of the app's origin from here keep working.
 */
export { appOrigin };

/**
 * Sends one outreach email to a lead's site and logs it to `OutreachMessage`
 * regardless of outcome. The claim link is supplied by the caller rather than
 * built here: issuing a claim invitation is a side effect (it revokes earlier
 * invitations and mints a token) that belongs to whoever owns that
 * invitation's lifecycle — `leadOutreachWorkflow` — not to the mailbox.
 *
 * The deterministic mailbox ID also anchors the provider idempotency key. A
 * crash can therefore replay the same provider attempt without rotating its
 * key. Definitive provider rejection is recorded as FAILED; ambiguous
 * acceptance remains QUEUED for a signed webhook or operator reconciliation.
 */
export async function sendLeadEmail(
  input:
    | {
        siteId: string;
        template: OutreachTemplateId;
        claimUrl: string;
        to?: string;
        actor: string;
        expectedReviewedAt: string;
        claimInvitationId: string;
        dispatchAuthorization: { dispatchId: string; attempt: number };
      }
    | {
        siteId: string;
        template: "operator_reply";
        body: string;
        actor: string;
        inReplyToMessageId?: string;
      },
): Promise<{
  id: string;
  status: OutreachStatus;
  deduplicated: boolean;
}> {
  if (input.template === "operator_reply") {
    return sendOperatorReply(input);
  }
  const db = getDb();
  const site = await db.site.findUnique({
    where: { id: input.siteId },
    select: {
      slug: true,
      name: true,
      vertical: true,
      leadContactEmail: true,
    },
  });
  if (!site) throw new OutreachError("Site not found.", 404);

  const to = input.to ?? site.leadContactEmail;
  if (!to) {
    throw new OutreachError(
      "No contact email on file for this site.",
      400,
    );
  }

  const previewUrl = `${appOrigin()}${buildImportUrls(site.slug).preview}`;
  const email = buildOutreachEmail(input.template, {
    siteName: site.name,
    vertical: site.vertical,
    previewUrl,
    claimUrl: input.claimUrl,
  });
  const storedEmail = buildOutreachEmail(input.template, {
    siteName: site.name,
    vertical: site.vertical,
    previewUrl,
    claimUrl: claimUrlWithoutBearer(input.claimUrl),
  });

  const idempotencyKey = `lead-outreach:${input.siteId}:${input.template}`;
  const messageId = deterministicOutreachMessageId(idempotencyKey);
  const reservation = await reserveOutreachMessage({
    db,
    messageId,
    idempotencyKey,
    siteId: input.siteId,
    template: input.template,
    to,
    from: email.from,
    replyTo: plusAddressReplyTo(email.replyTo, site.slug) ?? email.replyTo,
    subject: storedEmail.subject,
    text: storedEmail.text,
    html: storedEmail.html,
    actor: input.actor,
    threadKey: outreachThreadKey(input.siteId),
    rfcMessageId: normalizeRfcMessageId(
      outboundRfcMessageId(messageId, site.vertical),
    ),
  });
  let persistedMessageId = reservation.message.id;
  const deduplicated = reservation.deduplicated;
  if (!reservation.leaseId) {
    if (
      reservation.message.status === "QUEUED" ||
      (reservation.message.status === "FAILED" &&
        reservation.message.providerEventAt === null)
    ) {
      // A failed-retry CAS loser only has a stale FAILED snapshot. The winner
      // may already own the same stage-stable invitation and provider key, so
      // treating that snapshot as terminal could revoke a token in flight.
      // Fail closed as UNKNOWN; only a provider-terminal row may revoke it.
      throw new OutreachDeliveryUnknownError();
    }
    if (
      reservation.message.status === "FAILED" ||
      reservation.message.status === "BOUNCED" ||
      reservation.message.status === "COMPLAINED"
    ) {
      throw new OutreachTerminalDeliveryError();
    }
    return {
      id: persistedMessageId,
      status: reservation.message.status,
      deduplicated: true,
    };
  }
  let providerCallStarted = false;
  let providerAccepted = false;
  let result: DeliveryAttemptResult;
  try {
    result = await db.$transaction(async (transaction) => {
      await lockOutreachDelivery(transaction);
      await lockOutreachDispatchById(
        transaction,
        input.dispatchAuthorization.dispatchId,
      );
      await assertCurrentOutreachDispatch(transaction, {
        siteId: input.siteId,
        recipient: to,
        reviewedAt: input.expectedReviewedAt,
        template: input.template,
        dispatchId: input.dispatchAuthorization.dispatchId,
        attempt: input.dispatchAuthorization.attempt,
      });
      await lockOutreachSite(transaction, input.siteId);
      await assertReviewedLeadDelivery(transaction, {
        siteId: input.siteId,
        expectedRecipient: to,
        expectedReviewedAt: input.expectedReviewedAt,
        template: input.template,
      });

      await lockOutreachMessageById(transaction, reservation.message.id);
      const current = await transaction.outreachMessage.findUniqueOrThrow({
        where: { id: reservation.message.id },
      });
      persistedMessageId = current.id;
      if (current.status !== "QUEUED") {
        return { kind: "existing", status: current.status };
      }
      if (
        current.deliveryLeaseId !== reservation.leaseId ||
        !current.deliveryLeaseExpiresAt ||
        current.deliveryLeaseExpiresAt <= new Date()
      ) {
        throw new OutreachError(
          "The outreach delivery lease expired before provider delivery.",
          409,
        );
      }
      if (
        normalizeAccountEmail(current.toAddress) !==
        normalizeAccountEmail(to)
      ) {
        throw new OutreachError(
          "The queued outreach recipient no longer matches this dispatch.",
          409,
        );
      }
      await assertActiveOutreachInvitation(transaction, {
        invitationId: input.claimInvitationId,
        siteId: input.siteId,
        recipient: to,
        template: input.template,
      });
      providerCallStarted = true;
      const { data, error } = await sendBoundedResendEmail(
        {
          from: current.fromAddress,
          to: current.toAddress,
          replyTo: current.replyToAddress ?? undefined,
          subject: email.subject,
          html: email.html,
          text: email.text,
          headers: {
            "Message-ID": outboundRfcMessageId(current.id, site.vertical),
          },
          tags: [
            { name: "category", value: "lead_outreach" },
            { name: "outreach_message_id", value: current.id },
          ],
        },
        `outreach-${current.id}-attempt-${input.dispatchAuthorization.attempt}`,
      );
      if (data?.id) {
        providerAccepted = true;
        const sentAt = new Date();
        await transaction.outreachMessage.updateMany({
          where: {
            id: current.id,
            status: "QUEUED",
            OR: [
              { providerMessageId: null },
              { providerMessageId: data.id },
            ],
          },
          data: {
            status: "SENT",
            providerMessageId: data.id,
            providerAttemptedAt: sentAt,
            deliveryLeaseId: null,
            deliveryLeaseExpiresAt: null,
            sentAt,
            error: null,
          },
        });
        const persisted = await transaction.outreachMessage.findUniqueOrThrow({
          where: { id: current.id },
          select: { status: true },
        });
        return { kind: "accepted", status: persisted.status };
      }
      if (error && isDefinitiveResendRejection(error.statusCode)) {
        const reason = "Provider rejected outreach delivery.";
        const attemptedAt = new Date();
        await transaction.outreachMessage.updateMany({
          where: {
            id: current.id,
            status: "QUEUED",
            deliveryLeaseId: reservation.leaseId,
          },
          data: {
            status: "FAILED",
            providerAttemptedAt: attemptedAt,
            deliveryLeaseId: null,
            deliveryLeaseExpiresAt: null,
            error: reason,
          },
        });
        return { kind: "rejected", reason };
      }
      await transaction.outreachMessage.updateMany({
        where: {
          id: current.id,
          status: "QUEUED",
          deliveryLeaseId: reservation.leaseId,
        },
        data: {
          providerAttemptedAt: new Date(),
          error: "Provider acceptance is unknown; awaiting signed status.",
        },
      });
      return { kind: "unknown" };
    }, { maxWait: 5_000, timeout: 30_000 });
  } catch (error) {
    if (providerCallStarted || providerAccepted) {
      console.error("[outreach] provider acceptance is unknown", {
        siteId: input.siteId,
        template: input.template,
        messageId: persistedMessageId,
      });
      throw new OutreachDeliveryUnknownError();
    }
    const reason =
      error instanceof OutreachError
        ? error.message
        : "Outreach failed before provider delivery.";
    if (reservation.knownUnsent) {
      const failed = await db.outreachMessage.updateMany({
        where: {
          id: reservation.message.id,
          status: "QUEUED",
          providerAttemptedAt: null,
          deliveryLeaseId: reservation.leaseId,
        },
        data: {
          status: "FAILED",
          deliveryLeaseId: null,
          deliveryLeaseExpiresAt: null,
          error: reason,
        },
      });
      if (failed.count !== 1) {
        throw new OutreachDeliveryUnknownError();
      }
    } else {
      throw new OutreachDeliveryUnknownError();
    }
    console.error("[outreach] send failed", {
      siteId: input.siteId,
      template: input.template,
      actor: input.actor,
      error: reason,
    });
    throw error;
  }

  if (result.kind === "unknown") {
    throw new OutreachDeliveryUnknownError();
  }
  if (result.kind === "rejected") {
    console.error("[outreach] provider rejected send", {
      siteId: input.siteId,
      template: input.template,
      actor: input.actor,
    });
    throw new OutreachError(result.reason, 503);
  }
  if (
    result.status === "FAILED" ||
    result.status === "BOUNCED" ||
    result.status === "COMPLAINED"
  ) {
    throw new OutreachTerminalDeliveryError();
  }
  return {
    id: persistedMessageId,
    status: result.status,
    deduplicated: deduplicated || result.kind === "existing",
  };
}

async function sendOperatorReply(input: {
  siteId: string;
  template: "operator_reply";
  body: string;
  actor: string;
  inReplyToMessageId?: string;
}): Promise<{
  id: string;
  status: OutreachStatus;
  deduplicated: boolean;
}> {
  const body = input.body.trim();
  if (!body) throw new OutreachError("Write a reply before sending.", 400);
  const db = getDb();
  const site = await db.site.findUnique({
    where: { id: input.siteId },
    select: {
      slug: true,
      name: true,
      vertical: true,
      leadContactEmail: true,
    },
  });
  if (!site) throw new OutreachError("Site not found.", 404);
  if (!isVerticalOutreachConfigured(site.vertical)) {
    throw new OutreachError("This lead is not eligible for outreach.", 409);
  }
  const to = site.leadContactEmail;
  if (!to) {
    throw new OutreachError("No contact email on file for this site.", 400);
  }

  const thread = await db.outreachMessage.findMany({
    where: { siteId: input.siteId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      rfcMessageId: true,
      subject: true,
      direction: true,
    },
  });
  const inReplyToRow = input.inReplyToMessageId
    ? thread.find((message) => message.id === input.inReplyToMessageId) ??
      (await db.outreachMessage.findFirst({
        where: { id: input.inReplyToMessageId, siteId: input.siteId },
        select: { id: true, rfcMessageId: true, subject: true, direction: true },
      }))
    : thread[0] ?? null;
  if (!inReplyToRow) {
    throw new OutreachError("There is no outreach thread to reply on.", 409);
  }
  const inReplyTo =
    inReplyToRow.rfcMessageId ??
    normalizeRfcMessageId(outboundRfcMessageId(inReplyToRow.id, site.vertical));
  const references = [
    ...new Set(
      thread
        .map((message) => message.rfcMessageId)
        .filter((value): value is string => Boolean(value)),
    ),
  ]
    .reverse()
    .join(" ");
  const subject = replySubject(inReplyToRow.subject);
  const email = buildOperatorReplyEmail({
    vertical: site.vertical,
    siteName: site.name,
    body,
    subject,
  });
  const digest = createHash("sha256")
    .update(`${inReplyTo}:${body}`, "utf8")
    .digest("hex")
    .slice(0, 24);
  const idempotencyKey = `lead-outreach:${input.siteId}:operator_reply:${digest}`;
  const messageId = deterministicOutreachMessageId(idempotencyKey);
  const reservation = await reserveOutreachMessage({
    db,
    messageId,
    idempotencyKey,
    siteId: input.siteId,
    template: "operator_reply",
    to,
    from: email.from,
    replyTo: plusAddressReplyTo(email.replyTo, site.slug) ?? email.replyTo,
    subject: email.subject,
    text: email.text,
    html: email.html,
    actor: input.actor,
    threadKey: outreachThreadKey(input.siteId),
    rfcMessageId: normalizeRfcMessageId(
      outboundRfcMessageId(messageId, site.vertical),
    ),
    inReplyTo,
  });
  if (!reservation.leaseId) {
    if (
      reservation.message.status === "QUEUED" ||
      (reservation.message.status === "FAILED" &&
        reservation.message.providerEventAt === null)
    ) {
      throw new OutreachDeliveryUnknownError();
    }
    if (
      reservation.message.status === "FAILED" ||
      reservation.message.status === "BOUNCED" ||
      reservation.message.status === "COMPLAINED"
    ) {
      throw new OutreachTerminalDeliveryError();
    }
    return {
      id: reservation.message.id,
      status: reservation.message.status,
      deduplicated: true,
    };
  }

  let providerCallStarted = false;
  try {
    const result = await db.$transaction(async (transaction) => {
      await lockOutreachDelivery(transaction);
      await lockOutreachSite(transaction, input.siteId);
      await assertConfiguredOutreachSite(transaction, {
        siteId: input.siteId,
        expectedRecipient: to,
      });
      await lockOutreachMessageById(transaction, reservation.message.id);
      const current = await transaction.outreachMessage.findUniqueOrThrow({
        where: { id: reservation.message.id },
      });
      if (current.status !== "QUEUED") {
        return { kind: "existing" as const, status: current.status };
      }
      if (
        current.deliveryLeaseId !== reservation.leaseId ||
        !current.deliveryLeaseExpiresAt ||
        current.deliveryLeaseExpiresAt <= new Date()
      ) {
        throw new OutreachError(
          "The outreach delivery lease expired before provider delivery.",
          409,
        );
      }
      providerCallStarted = true;
      const { data, error } = await sendBoundedResendEmail(
        {
          from: current.fromAddress,
          to: current.toAddress,
          replyTo: current.replyToAddress ?? undefined,
          subject: email.subject,
          html: email.html,
          text: email.text,
          headers: {
            "Message-ID": outboundRfcMessageId(current.id, site.vertical),
            "In-Reply-To": inReplyTo.includes("<") ? inReplyTo : `<${inReplyTo}>`,
            "References": references || (inReplyTo.includes("<") ? inReplyTo : `<${inReplyTo}>`),
          },
          tags: [
            { name: "category", value: "lead_outreach" },
            { name: "outreach_message_id", value: current.id },
          ],
        },
        `outreach-${current.id}-reply`,
      );
      if (data?.id) {
        const sentAt = new Date();
        await transaction.outreachMessage.updateMany({
          where: {
            id: current.id,
            status: "QUEUED",
            OR: [{ providerMessageId: null }, { providerMessageId: data.id }],
          },
          data: {
            status: "SENT",
            providerMessageId: data.id,
            providerAttemptedAt: sentAt,
            deliveryLeaseId: null,
            deliveryLeaseExpiresAt: null,
            sentAt,
            error: null,
          },
        });
        const persisted = await transaction.outreachMessage.findUniqueOrThrow({
          where: { id: current.id },
          select: { status: true },
        });
        return { kind: "accepted" as const, status: persisted.status };
      }
      if (error && isDefinitiveResendRejection(error.statusCode)) {
        await transaction.outreachMessage.updateMany({
          where: {
            id: current.id,
            status: "QUEUED",
            deliveryLeaseId: reservation.leaseId,
          },
          data: {
            status: "FAILED",
            providerAttemptedAt: new Date(),
            deliveryLeaseId: null,
            deliveryLeaseExpiresAt: null,
            error: "Provider rejected outreach delivery.",
          },
        });
        return {
          kind: "rejected" as const,
          reason: "Provider rejected outreach delivery.",
        };
      }
      await transaction.outreachMessage.updateMany({
        where: {
          id: current.id,
          status: "QUEUED",
          deliveryLeaseId: reservation.leaseId,
        },
        data: {
          providerAttemptedAt: new Date(),
          error: "Provider acceptance is unknown; awaiting signed status.",
        },
      });
      return { kind: "unknown" as const };
    }, { maxWait: 5_000, timeout: 30_000 });
    if (result.kind === "unknown") throw new OutreachDeliveryUnknownError();
    if (result.kind === "rejected") {
      throw new OutreachError(result.reason, 503);
    }
    return {
      id: reservation.message.id,
      status: result.status,
      deduplicated: reservation.deduplicated || result.kind === "existing",
    };
  } catch (error) {
    if (providerCallStarted) throw new OutreachDeliveryUnknownError();
    throw error;
  }
}

async function reserveOutreachMessage(input: {
  db: ReturnType<typeof getDb>;
  messageId: string;
  idempotencyKey: string;
  siteId: string;
  template: string;
  to: string;
  from: string;
  replyTo: string | undefined;
  subject: string;
  text: string;
  html: string;
  actor: string;
  threadKey: string;
  rfcMessageId: string;
  inReplyTo?: string;
}): Promise<{
  message: OutreachMessage;
  leaseId: string | null;
  knownUnsent: boolean;
  deduplicated: boolean;
}> {
  const now = new Date();
  const leaseId = randomUUID();
  const deliveryLeaseExpiresAt = new Date(
    now.getTime() + OUTREACH_DELIVERY_LEASE_MS,
  );
  const reserved = await input.db.outreachMessage.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    update: {},
    create: {
      id: input.messageId,
      idempotencyKey: input.idempotencyKey,
      siteId: input.siteId,
      direction: "OUTBOUND",
      fromAddress: input.from,
      replyToAddress: input.replyTo,
      toAddress: input.to,
      subject: input.subject,
      textBody: input.text,
      htmlBody: input.html,
      template: input.template,
      inReplyTo: input.inReplyTo,
      threadKey: input.threadKey,
      rfcMessageId: input.rfcMessageId,
      createdByActor: input.actor,
      status: "QUEUED",
      deliveryLeaseId: leaseId,
      deliveryLeaseExpiresAt,
    },
  });
  if (reserved.deliveryLeaseId === leaseId) {
    return {
      message: reserved,
      leaseId,
      knownUnsent: true,
      deduplicated: false,
    };
  }
  if (
    input.template === "preview_ready" &&
    isOutreachMessageRetryable(reserved, now)
  ) {
    const reset = await input.db.outreachMessage.updateMany({
      where: {
        id: reserved.id,
        status: "FAILED",
        providerEventAt: null,
        createdAt: {
          gt: new Date(now.getTime() - PROVIDER_IDEMPOTENCY_WINDOW_MS),
        },
      },
      data: {
        status: "QUEUED",
        providerMessageId: null,
        providerAttemptedAt: null,
        fromAddress: input.from,
        replyToAddress: input.replyTo,
        toAddress: input.to,
        subject: input.subject,
        textBody: input.text,
        htmlBody: input.html,
        error: null,
        sentAt: null,
        deliveredAt: null,
        deliveryLeaseId: leaseId,
        deliveryLeaseExpiresAt,
      },
    });
    if (reset.count === 1) {
      const message = await input.db.outreachMessage.findUniqueOrThrow({
        where: { id: reserved.id },
      });
      return {
        message,
        leaseId,
        knownUnsent: true,
        deduplicated: true,
      };
    }
  }
  if (
    reserved.status === "QUEUED" &&
    now.getTime() - reserved.createdAt.getTime() <
      PROVIDER_IDEMPOTENCY_WINDOW_MS
  ) {
    const acquired = await input.db.outreachMessage.updateMany({
      where: {
        id: reserved.id,
        status: "QUEUED",
        OR: [
          { deliveryLeaseId: null },
          { deliveryLeaseExpiresAt: { lte: now } },
        ],
      },
      data: { deliveryLeaseId: leaseId, deliveryLeaseExpiresAt },
    });
    if (acquired.count === 1) {
      const message = await input.db.outreachMessage.findUniqueOrThrow({
        where: { id: reserved.id },
      });
      return {
        message,
        leaseId,
        knownUnsent: false,
        deduplicated: true,
      };
    }
  }
  return {
    message: reserved,
    leaseId: null,
    knownUnsent: false,
    deduplicated: true,
  };
}

async function assertCurrentOutreachDispatch(
  transaction: Prisma.TransactionClient,
  input: {
    siteId: string;
    recipient: string;
    reviewedAt: string;
    template: OutreachTemplateId;
    dispatchId: string;
    attempt: number;
  },
): Promise<void> {
  const dispatch = await transaction.outreachDispatch.findUnique({
    where: { id: input.dispatchId },
    select: {
      siteId: true,
      template: true,
      recipient: true,
      reviewedAt: true,
      status: true,
      attempt: true,
    },
  });
  const expectedStatus =
    input.template === "preview_ready" ? "QUEUED" : "SENT";
  if (
    !dispatch ||
    dispatch.siteId !== input.siteId ||
    dispatch.template !== "preview_ready" ||
    normalizeAccountEmail(dispatch.recipient) !==
      normalizeAccountEmail(input.recipient) ||
    dispatch.reviewedAt.toISOString() !== input.reviewedAt ||
    dispatch.status !== expectedStatus ||
    dispatch.attempt !== input.attempt
  ) {
    throw new OutreachError(
      "The outreach dispatch authorization expired before delivery.",
      409,
    );
  }
}

async function assertActiveOutreachInvitation(
  transaction: Prisma.TransactionClient,
  input: {
    invitationId: string;
    siteId: string;
    recipient: string;
    template: OutreachTemplateId;
  },
): Promise<void> {
  await lockClaimInvitationById(transaction, input.invitationId);
  const invitation = await transaction.claimInvitation.findUnique({
    where: { id: input.invitationId },
    select: {
      siteId: true,
      email: true,
      outreachKey: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
    },
  });
  if (
    !invitation ||
    invitation.siteId !== input.siteId ||
    normalizeAccountEmail(invitation.email) !==
      normalizeAccountEmail(input.recipient) ||
    invitation.outreachKey !==
      `lead-outreach:${input.siteId}:${input.template}` ||
    invitation.acceptedAt !== null ||
    invitation.revokedAt !== null ||
    invitation.expiresAt <= new Date()
  ) {
    throw new OutreachError(
      "The outreach claim invitation is no longer active.",
      409,
    );
  }
}

async function assertReviewedLeadDelivery(
  transaction: Prisma.TransactionClient,
  input: {
    siteId: string;
    expectedRecipient: string;
    expectedReviewedAt: string;
    template: OutreachTemplateId;
  },
): Promise<void> {
  const [site, pauseSettings] = await Promise.all([
    transaction.site.findUnique({
      where: { id: input.siteId },
      select: {
        leadContactEmail: true,
        status: true,
        vertical: true,
        attributes: true,
        updatedAt: true,
        auditEvents: {
          where: { type: "site.review.completed" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    }),
    transaction.operatorSetting.findMany({
      where: {
        key: {
          in: [
            GLOBAL_OUTREACH_PAUSE_KEY,
            siteOutreachPauseKey(input.siteId),
          ],
        },
      },
      select: { key: true, value: true },
    }),
  ]);
  const eligibility = evaluateLeadOutreachEligibility(
    site?.attributes,
    site?.leadContactEmail ?? input.expectedRecipient,
  );
  if (
    !site ||
    isOutreachPaused(pauseSettings, input.siteId) ||
    !isVerticalOutreachConfigured(site.vertical) ||
    !mutableLeadStatuses.has(site.status) ||
    !site.leadContactEmail ||
    normalizeAccountEmail(site.leadContactEmail) !==
      normalizeAccountEmail(input.expectedRecipient) ||
    site.auditEvents[0]?.createdAt.toISOString() !== input.expectedReviewedAt ||
    !isOperatorReviewCurrent(
      site.auditEvents[0]?.createdAt ?? null,
      site.updatedAt,
    ) ||
    !eligibility.allowed
  ) {
    const reason = eligibility.allowed
      ? "The reviewed lead became ineligible before delivery."
      : `The reviewed lead became ineligible before delivery: ${eligibility.message}`;
    throw new OutreachError(reason, 409);
  }
  if (input.template === "follow_up_1") {
    const initialKey = `lead-outreach:${input.siteId}:preview_ready`;
    await lockOutreachMessageByKey(transaction, initialKey);
    const initial = await transaction.outreachMessage.findUnique({
      where: { idempotencyKey: initialKey },
      select: { status: true },
    });
    if (initial?.status !== "SENT" && initial?.status !== "DELIVERED") {
      throw new OutreachError(
        "The initial outreach is not eligible for follow-up.",
        409,
      );
    }
    const inbound = await transaction.outreachMessage.findFirst({
      where: { siteId: input.siteId, direction: "INBOUND" },
      select: { id: true },
    });
    if (inbound) {
      throw new OutreachError("This lead already replied.", 409);
    }
  }
}

async function assertConfiguredOutreachSite(
  transaction: Prisma.TransactionClient,
  input: { siteId: string; expectedRecipient: string },
): Promise<void> {
  const [site, pauseSettings] = await Promise.all([
    transaction.site.findUnique({
      where: { id: input.siteId },
      select: { vertical: true, leadContactEmail: true },
    }),
    transaction.operatorSetting.findMany({
      where: {
        key: {
          in: [
            GLOBAL_OUTREACH_PAUSE_KEY,
            siteOutreachPauseKey(input.siteId),
          ],
        },
      },
      select: { key: true, value: true },
    }),
  ]);
  if (
    !site ||
    isOutreachPaused(pauseSettings, input.siteId) ||
    !isVerticalOutreachConfigured(site.vertical) ||
    !site.leadContactEmail ||
    normalizeAccountEmail(site.leadContactEmail) !==
      normalizeAccountEmail(input.expectedRecipient)
  ) {
    throw new OutreachError(
      "The outreach lead became ineligible before delivery.",
      409,
    );
  }
}

type DeliveryAttemptResult =
  | { kind: "accepted" | "existing"; status: OutreachStatus }
  | { kind: "rejected"; reason: string }
  | { kind: "unknown" };

function claimUrlWithoutBearer(claimUrl: string): string {
  const url = new URL(claimUrl);
  url.hash = "";
  return url.toString();
}

function deterministicOutreachMessageId(idempotencyKey: string): string {
  return `outreach_${createHash("sha256")
    .update(idempotencyKey, "utf8")
    .digest("hex")
    .slice(0, 24)}`;
}

export function listOutreachMessages(
  siteId: string,
): Promise<OutreachMessage[]> {
  const db = getDb();
  return db.outreachMessage.findMany({
    where: { siteId },
    orderBy: { createdAt: "asc" },
  });
}
