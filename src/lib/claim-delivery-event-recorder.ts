import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import {
  canApplyResendClaimEvent,
  claimDeliveryFailureCode,
  RESEND_CLAIM_EVENT_TRANSITIONS,
  type ResendClaimEventType,
} from "@/lib/claim-delivery-policy";

export async function recordResendClaimEvent(
  input: {
    eventId: string;
    eventType: ResendClaimEventType;
    occurredAt: Date;
    providerMessageId: string;
    taggedClaimInvitationId?: string;
  },
  database: Pick<PrismaClient, "$transaction"> = getDb(),
): Promise<{ handled: boolean; updated: number }> {
  return database.$transaction(async (tx) => {
    const taggedInvitation = input.taggedClaimInvitationId
      ? await tx.claimInvitation.findUnique({
          where: { id: input.taggedClaimInvitationId },
          select: {
            id: true,
            providerMessageId: true,
            providerEventAt: true,
            deliveryStatus: true,
          },
        })
      : null;
    const invitation =
      taggedInvitation ??
      (await tx.claimInvitation.findUnique({
        where: { providerMessageId: input.providerMessageId },
        select: {
          id: true,
          providerMessageId: true,
          providerEventAt: true,
          deliveryStatus: true,
        },
      }));
    if (
      !invitation ||
      (invitation.providerMessageId &&
        invitation.providerMessageId !== input.providerMessageId)
    ) {
      return { handled: false, updated: 0 };
    }

    const transition = RESEND_CLAIM_EVENT_TRANSITIONS[input.eventType];
    const event = await tx.claimProviderEvent.upsert({
      where: { id: input.eventId },
      update: {},
      create: {
        id: input.eventId,
        claimInvitationId: invitation.id,
        providerMessageId: input.providerMessageId,
        eventType: input.eventType,
        deliveryStatus: transition.status,
        occurredAt: input.occurredAt,
      },
      select: {
        claimInvitationId: true,
        providerMessageId: true,
        eventType: true,
        occurredAt: true,
      },
    });
    if (
      event.claimInvitationId !== invitation.id ||
      event.providerMessageId !== input.providerMessageId ||
      event.eventType !== input.eventType ||
      event.occurredAt.getTime() !== input.occurredAt.getTime()
    ) {
      throw new Error("Resend claim event identity mismatch");
    }

    if (
      !canApplyResendClaimEvent({
        currentStatus: invitation.deliveryStatus,
        currentEventAt: invitation.providerEventAt,
        eventType: input.eventType,
        occurredAt: input.occurredAt,
      })
    ) {
      return { handled: true, updated: 0 };
    }

    const updated = await tx.claimInvitation.updateMany({
      where: {
        id: invitation.id,
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
        deliveryFailureCode: claimDeliveryFailureCode(input.eventType),
      },
    });
    return { handled: true, updated: updated.count };
  });
}
