import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import {
  canApplyResendAuthEvent,
  RESEND_AUTH_EVENT_TRANSITIONS,
  type ResendAuthEventType,
} from "@/lib/auth-delivery-policy";

export async function recordResendAuthEvent(input: {
  eventId: string;
  eventType: ResendAuthEventType;
  occurredAt: Date;
  providerMessageId: string;
  taggedAuthMagicLinkId?: string;
}, database: Pick<PrismaClient, "$transaction"> = getDb()): Promise<{
  handled: boolean;
  updated: number;
}> {
  const db = database;
  return db.$transaction(async (tx) => {
    const taggedLink = input.taggedAuthMagicLinkId
      ? await tx.authMagicLink.findUnique({
          where: { id: input.taggedAuthMagicLinkId },
          select: {
            id: true,
            providerMessageId: true,
            providerEventAt: true,
            deliveryStatus: true,
            tokenHash: true,
          },
        })
      : null;
    const link =
      taggedLink ??
      (await tx.authMagicLink.findFirst({
        where: { providerMessageId: input.providerMessageId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          providerMessageId: true,
          providerEventAt: true,
          deliveryStatus: true,
          tokenHash: true,
        },
      }));
    if (
      !link ||
      (link.providerMessageId &&
        link.providerMessageId !== input.providerMessageId)
    ) {
      return { handled: false, updated: 0 };
    }

    const transition = RESEND_AUTH_EVENT_TRANSITIONS[input.eventType];
    const event = await tx.authProviderEvent.upsert({
      where: { id: input.eventId },
      update: {},
      create: {
        id: input.eventId,
        authMagicLinkId: link.id,
        providerMessageId: input.providerMessageId,
        eventType: input.eventType,
        deliveryStatus: transition.status,
        occurredAt: input.occurredAt,
      },
      select: {
        authMagicLinkId: true,
        providerMessageId: true,
        eventType: true,
        occurredAt: true,
      },
    });
    if (
      event.authMagicLinkId !== link.id ||
      event.providerMessageId !== input.providerMessageId ||
      event.eventType !== input.eventType ||
      event.occurredAt.getTime() !== input.occurredAt.getTime()
    ) {
      throw new Error("Resend auth event identity mismatch");
    }

    if (
      !canApplyResendAuthEvent({
        currentStatus: link.deliveryStatus,
        currentEventAt: link.providerEventAt,
        eventType: input.eventType,
        occurredAt: input.occurredAt,
      })
    ) {
      return { handled: true, updated: 0 };
    }

    const updated = await tx.authMagicLink.updateMany({
      where: {
        id: link.id,
        deliveryStatus: { in: [...transition.from] },
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
        deliveryStatus: transition.status,
        deliveredAt:
          transition.status === "DELIVERED" ? input.occurredAt : undefined,
        failureCode: failureCode(input.eventType),
      },
    });
    if (
      updated.count === 1 &&
      (transition.status === "FAILED" ||
        transition.status === "BOUNCED" ||
        transition.status === "SUPPRESSED")
    ) {
      await tx.authMagicLink.updateMany({
        where: { id: link.id, revokedAt: null },
        data: { revokedAt: input.occurredAt },
      });
      await tx.verification.deleteMany({
        where: { identifier: link.tokenHash },
      });
    }
    return { handled: true, updated: updated.count };
  });
}

function failureCode(eventType: ResendAuthEventType): string | null {
  if (eventType === "email.failed") return "provider_reported_failure";
  if (eventType === "email.suppressed") return "provider_suppressed";
  if (eventType === "email.bounced") return "recipient_bounced";
  if (eventType === "email.complained") return "recipient_complained";
  return null;
}
