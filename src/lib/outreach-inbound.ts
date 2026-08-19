import "server-only";
import { Vertical } from "@/generated/prisma/enums";
import { normalizeAccountEmail } from "@/lib/account-email";
import { getDb } from "@/lib/db";
import { captureOperatorAlert } from "@/lib/operator-alerts";
import { RESTOFRONT_OUTREACH_REPLY_TO } from "@/lib/outreach-readiness";
import {
  extractEmailAddress,
  extractEmailAddresses,
  htmlToPlainText,
  inboundThreadTokens,
  normalizeRfcMessageId,
  outreachThreadKey,
  parseRfcMessageIds,
  type InboundAddressFields,
} from "@/lib/outreach-thread";
import { fetchReceivedResendEmail } from "@/lib/resend-receiving";

export type RecordInboundOutreachResult = {
  handled: boolean;
  created: boolean;
  retry: boolean;
  siteId: string | null;
  messageId: string | null;
};

export type InboundWebhookMetadata = {
  emailId: string;
  from: string;
  to: string[];
  subject: string;
  rfcMessageId: string | null;
  receivedFor: string[];
};

export async function recordInboundOutreachMessage(input: {
  eventId: string;
  occurredAt: Date;
  metadata: InboundWebhookMetadata;
}): Promise<RecordInboundOutreachResult> {
  const db = getDb();
  const existing = await db.outreachMessage.findUnique({
    where: { providerMessageId: input.metadata.emailId },
    select: { id: true, siteId: true },
  });
  if (existing) {
    return {
      handled: true,
      created: false,
      retry: false,
      siteId: existing.siteId,
      messageId: existing.id,
    };
  }

  const received = await fetchReceivedResendEmail(input.metadata.emailId);
  if (!received) {
    return {
      handled: false,
      created: false,
      retry: true,
      siteId: null,
      messageId: null,
    };
  }

  const headers = received.headers;
  const fields: InboundAddressFields = {
    from: received.from || input.metadata.from,
    to: received.to.length > 0 ? received.to : input.metadata.to,
    receivedFor:
      received.receivedFor.length > 0
        ? received.receivedFor
        : input.metadata.receivedFor,
    inReplyTo: headers["in-reply-to"] ?? null,
    references: headers.references ?? null,
    rfcMessageId: received.messageId ?? input.metadata.rfcMessageId,
  };
  const matched = await matchInboundOutreachThread(fields);
  if (!matched) {
    await captureOperatorAlert({
      kind: "OUTREACH_REPLY",
      dedupKey: `inbound-unmatched:${input.metadata.emailId}`,
      title: "Inbound outreach reply could not be matched",
      message:
        "A signed inbound email did not match a Restofront outreach thread. Inspect the From/To headers and mailbox.",
      context: {
        emailId: input.metadata.emailId,
        from: fields.from,
      },
      occurredAt: input.occurredAt,
    });
    return {
      handled: false,
      created: false,
      retry: false,
      siteId: null,
      messageId: null,
    };
  }

  const textBody =
    received.text?.trim() ||
    (received.html ? htmlToPlainText(received.html) : "") ||
    received.subject ||
    input.metadata.subject ||
    "(empty reply)";
  const receivedAt = input.occurredAt;
  const rfcMessageId = fields.rfcMessageId
    ? normalizeRfcMessageId(fields.rfcMessageId)
    : `resend-inbound:${input.metadata.emailId}`;
  const fromAddress =
    extractEmailAddress(fields.from) ?? fields.from.toLowerCase();
  const toAddress =
    extractEmailAddresses(fields.to)[0] ??
    extractEmailAddresses(fields.receivedFor ?? [])[0] ??
    RESTOFRONT_OUTREACH_REPLY_TO;

  try {
    const created = await db.outreachMessage.create({
      data: {
        idempotencyKey: `resend-inbound:${input.metadata.emailId}`,
        siteId: matched.siteId,
        direction: "INBOUND",
        provider: "resend",
        providerMessageId: input.metadata.emailId,
        rfcMessageId,
        fromAddress,
        replyToAddress: null,
        toAddress,
        subject: received.subject || input.metadata.subject || "(no subject)",
        textBody,
        htmlBody: received.html,
        template: null,
        inReplyTo: fields.inReplyTo,
        threadKey: matched.threadKey,
        createdByActor: `lead:${fromAddress}`,
        status: "RECEIVED",
        receivedAt,
      },
      select: { id: true },
    });
    await db.auditEvent.create({
      data: {
        type: "outreach.inbound.received",
        actor: `lead:${fromAddress}`,
        siteId: matched.siteId,
        metadata: {
          outreachMessageId: created.id,
          threadKey: matched.threadKey,
          providerMessageId: input.metadata.emailId,
        },
        createdAt: receivedAt,
      },
    });
    await captureOperatorAlert({
      kind: "OUTREACH_REPLY",
      dedupKey: `inbound:${input.metadata.emailId}`,
      title: "A Restofront lead replied",
      message:
        "An inbound reply was stored on the lead thread. Follow-up campaign sends are stopped; reply from /admin.",
      context: {
        siteId: matched.siteId,
        outreachMessageId: created.id,
      },
      occurredAt: receivedAt,
    });
    return {
      handled: true,
      created: true,
      retry: false,
      siteId: matched.siteId,
      messageId: created.id,
    };
  } catch (error) {
    const duplicate = await db.outreachMessage.findUnique({
      where: { providerMessageId: input.metadata.emailId },
      select: { id: true, siteId: true },
    });
    if (duplicate) {
      return {
        handled: true,
        created: false,
        retry: false,
        siteId: duplicate.siteId,
        messageId: duplicate.id,
      };
    }
    throw error;
  }
}

export async function matchInboundOutreachThread(
  fields: InboundAddressFields,
): Promise<{ siteId: string; threadKey: string } | null> {
  const db = getDb();
  const tokens = inboundThreadTokens(fields);
  if (tokens.length > 0) {
    const byHeader = await db.outreachMessage.findFirst({
      where: {
        OR: [
          { rfcMessageId: { in: tokens } },
          { id: { in: tokens } },
          { providerMessageId: { in: tokens } },
          { threadKey: { in: tokens.map((token) =>
              token.startsWith("lead:") ? token : `lead:${token}`,
            ) } },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: { siteId: true, threadKey: true },
    });
    if (byHeader) {
      return {
        siteId: byHeader.siteId,
        threadKey: byHeader.threadKey ?? outreachThreadKey(byHeader.siteId),
      };
    }

    const plusTags = tokens.filter((token) => !token.includes("@"));
    if (plusTags.length > 0) {
      const byPlus = await db.site.findFirst({
        where: {
          vertical: Vertical.RESTAURANT,
          OR: [{ slug: { in: plusTags } }, { id: { in: plusTags } }],
        },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });
      if (byPlus) {
        return {
          siteId: byPlus.id,
          threadKey: outreachThreadKey(byPlus.id),
        };
      }
    }
  }

  const from = safeEmail(fields.from);
  if (!from || !isRestofrontInboundRecipient(fields)) return null;
  const byContact = await db.site.findFirst({
    where: {
      vertical: Vertical.RESTAURANT,
      email: from,
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  if (!byContact) return null;
  return {
    siteId: byContact.id,
    threadKey: outreachThreadKey(byContact.id),
  };
}

export function isRestofrontInboundRecipient(fields: InboundAddressFields): boolean {
  const recipients = extractEmailAddresses([
    ...fields.to,
    ...(fields.receivedFor ?? []),
  ]);
  const replyTo = RESTOFRONT_OUTREACH_REPLY_TO.toLowerCase();
  const replyDomain = replyTo.slice(replyTo.indexOf("@"));
  return recipients.some((address) => {
    if (address === replyTo) return true;
    const at = address.indexOf("@");
    if (at < 0) return false;
    const local = address.slice(0, at);
    const domain = address.slice(at);
    return domain === replyDomain && (local === "vincent" || local.startsWith("vincent+"));
  });
}

function safeEmail(value: string): string | null {
  const extracted = extractEmailAddress(value);
  if (!extracted) return null;
  try {
    return normalizeAccountEmail(extracted);
  } catch {
    return extracted;
  }
}

export function inboundHeaderMessageIds(headers: Record<string, string>): string[] {
  return [
    ...parseRfcMessageIds(headers["in-reply-to"]),
    ...parseRfcMessageIds(headers.references),
  ];
}
