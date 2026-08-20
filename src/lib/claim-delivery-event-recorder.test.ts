import { describe, expect, it, mock } from "bun:test";
import type { PrismaClient } from "@/generated/prisma/client";

mock.module("server-only", () => ({}));

const { recordResendClaimEvent } = await import(
  "@/lib/claim-delivery-event-recorder"
);

describe("claim invitation provider event persistence", () => {
  it("applies signed events once and preserves terminal ordering", async () => {
    const fixture = deliveryFixture();
    const delivered = {
      eventId: "webhook_delivered",
      eventType: "email.delivered" as const,
      occurredAt: new Date("2026-08-20T10:01:00.000Z"),
      providerMessageId: "resend_1",
      taggedClaimInvitationId: "invite_1",
    };

    expect(await recordResendClaimEvent(delivered, fixture.db)).toEqual({
      handled: true,
      updated: 1,
    });
    expect(await recordResendClaimEvent(delivered, fixture.db)).toEqual({
      handled: true,
      updated: 0,
    });
    expect(fixture.state.events).toHaveLength(1);
    expect(fixture.state.invitation.deliveryStatus).toBe("DELIVERED");

    expect(
      await recordResendClaimEvent(
        {
          eventId: "webhook_bounced",
          eventType: "email.bounced",
          occurredAt: new Date("2026-08-20T10:02:00.000Z"),
          providerMessageId: "resend_1",
          taggedClaimInvitationId: "invite_1",
        },
        fixture.db,
      ),
    ).toEqual({ handled: true, updated: 1 });
    expect(fixture.state.invitation).toMatchObject({
      deliveryStatus: "BOUNCED",
      deliveryFailureCode: "recipient_bounced",
    });
  });

  it("rejects a tag that conflicts with an already bound provider id", async () => {
    const fixture = deliveryFixture();

    expect(
      await recordResendClaimEvent(
        {
          eventId: "webhook_forged",
          eventType: "email.delivered",
          occurredAt: new Date("2026-08-20T10:01:00.000Z"),
          providerMessageId: "resend_other",
          taggedClaimInvitationId: "invite_1",
        },
        fixture.db,
      ),
    ).toEqual({ handled: false, updated: 0 });
    expect(fixture.state.events).toHaveLength(0);
  });
});

function deliveryFixture() {
  const state = {
    invitation: {
      id: "invite_1",
      providerMessageId: "resend_1" as string | null,
      providerEventAt: null as Date | null,
      deliveryStatus: "SENT" as
        | "PENDING"
        | "SENT"
        | "DELIVERED"
        | "BOUNCED"
        | "SUPPRESSED"
        | "FAILED",
      deliveredAt: null as Date | null,
      deliveryFailureCode: null as string | null,
    },
    events: [] as Array<{
      id: string;
      claimInvitationId: string;
      providerMessageId: string;
      eventType: string;
      occurredAt: Date;
    }>,
  };
  const tx = {
    claimInvitation: {
      findUnique: async ({ where }: { where: Record<string, string> }) =>
        where.id === state.invitation.id ||
        where.providerMessageId === state.invitation.providerMessageId
          ? state.invitation
          : null,
      updateMany: async (input: {
        where: { deliveryStatus: { in: string[] } };
        data: {
          providerMessageId: string;
          providerEventAt: Date;
          deliveryStatus: typeof state.invitation.deliveryStatus;
          deliveredAt?: Date;
          deliveryFailureCode: string | null;
        };
      }) => {
        if (
          !input.where.deliveryStatus.in.includes(
            state.invitation.deliveryStatus,
          )
        ) {
          return { count: 0 };
        }
        Object.assign(state.invitation, input.data);
        return { count: 1 };
      },
    },
    claimProviderEvent: {
      upsert: async (input: {
        where: { id: string };
        create: (typeof state.events)[number] & { deliveryStatus: string };
      }) => {
        const existing = state.events.find(
          (event) => event.id === input.where.id,
        );
        if (existing) return existing;
        state.events.push(input.create);
        return input.create;
      },
    },
  };
  const db = {
    $transaction: async (
      operation: (transaction: typeof tx) => Promise<unknown>,
    ) => operation(tx),
  } as unknown as Pick<PrismaClient, "$transaction">;
  return { state, db };
}
