import "server-only";
import { getDb } from "@/lib/db";
import {
  canApplyResendOutreachEvent,
  RESEND_OUTREACH_EVENT_TRANSITIONS,
  type ResendOutreachEventType,
} from "@/lib/outreach-event-policy";
import { lockOutreachDelivery } from "@/lib/outreach-lock";

/**
 * Durably records one signed Resend delivery event and applies only a current,
 * monotonic mailbox transition. Kept separate from the route-facing exports
 * so the stateful operator-flow test can exercise the real recorder while the
 * signature-focused route test mocks only its boundary.
 */
export async function recordResendOutreachEvent(input: {
  eventId: string;
  eventType: ResendOutreachEventType;
  occurredAt: Date;
  providerMessageId: string;
  taggedOutreachMessageId?: string;
}): Promise<{ handled: boolean; updated: number }> {
  const db = getDb();
  return db.$transaction(async (tx) => {
    // Delivery and terminal suppression events share one lock order so a
    // complaint/bounce either commits before the final send check or after the
    // already-started provider attempt, never in the gap between them.
    await lockOutreachDelivery(tx);
    const taggedMessage = input.taggedOutreachMessageId
      ? await tx.outreachMessage.findUnique({
          where: { id: input.taggedOutreachMessageId },
          select: {
            id: true,
            providerMessageId: true,
            providerEventAt: true,
            status: true,
          },
        })
      : null;
    const message =
      taggedMessage ??
      (await tx.outreachMessage.findUnique({
        where: { providerMessageId: input.providerMessageId },
        select: {
          id: true,
          providerMessageId: true,
          providerEventAt: true,
          status: true,
        },
      }));
    if (
      !message ||
      (message.providerMessageId &&
        message.providerMessageId !== input.providerMessageId)
    ) {
      return { handled: false, updated: 0 };
    }

    const transition = RESEND_OUTREACH_EVENT_TRANSITIONS[input.eventType];
    const event = await tx.outreachProviderEvent.upsert({
      where: { id: input.eventId },
      update: {},
      create: {
        id: input.eventId,
        outreachMessageId: message.id,
        providerMessageId: input.providerMessageId,
        eventType: input.eventType,
        status: transition.status,
        occurredAt: input.occurredAt,
      },
      select: {
        outreachMessageId: true,
        providerMessageId: true,
        eventType: true,
        occurredAt: true,
      },
    });
    if (
      event.outreachMessageId !== message.id ||
      event.providerMessageId !== input.providerMessageId ||
      event.eventType !== input.eventType ||
      event.occurredAt.getTime() !== input.occurredAt.getTime()
    ) {
      throw new Error("Resend webhook event identity mismatch");
    }

    if (
      !canApplyResendOutreachEvent({
        currentStatus: message.status,
        currentEventAt: message.providerEventAt,
        eventType: input.eventType,
        occurredAt: input.occurredAt,
      })
    ) {
      return { handled: true, updated: 0 };
    }

    const updated = await tx.outreachMessage.updateMany({
      where: {
        id: message.id,
        status: { in: [...transition.from] },
        OR: [
          { providerMessageId: null },
          { providerMessageId: input.providerMessageId },
        ],
        AND: [
          {
            OR: [
              { providerEventAt: null },
              { providerEventAt: { lte: input.occurredAt } },
            ],
          },
        ],
      },
      data: {
        providerMessageId: input.providerMessageId,
        providerEventAt: input.occurredAt,
        status: transition.status,
        deliveredAt:
          transition.status === "DELIVERED" ? input.occurredAt : undefined,
        error:
          transition.status === "SENT" || transition.status === "DELIVERED"
            ? null
            : failureLabel(input.eventType),
      },
    });
    return { handled: true, updated: updated.count };
  });
}

function failureLabel(eventType: ResendOutreachEventType): string | undefined {
  if (eventType === "email.failed")
    return "Provider reported delivery failure.";
  if (eventType === "email.suppressed") {
    return "Provider suppressed delivery to this recipient.";
  }
  if (eventType === "email.bounced") return "Recipient address bounced.";
  if (eventType === "email.complained") {
    return "Recipient reported this email as spam.";
  }
  return undefined;
}
