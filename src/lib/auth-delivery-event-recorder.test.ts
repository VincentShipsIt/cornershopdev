import { describe, expect, it, mock } from "bun:test";
import type { PrismaClient } from "@/generated/prisma/client";

mock.module("server-only", () => ({}));

const { recordResendAuthEvent } = await import(
  "@/lib/auth-delivery-event-recorder"
);

describe("authentication provider event persistence", () => {
  it("applies signed events once and preserves terminal ordering", async () => {
    const fixture = deliveryFixture();
    const delivered = {
      eventId: "webhook_delivered",
      eventType: "email.delivered" as const,
      occurredAt: new Date("2026-08-20T10:01:00.000Z"),
      providerMessageId: "resend_1",
      taggedAuthMagicLinkId: "link_1",
    };

    expect(await recordResendAuthEvent(delivered, fixture.db)).toEqual({
      handled: true,
      updated: 1,
    });
    expect(await recordResendAuthEvent(delivered, fixture.db)).toEqual({
      handled: true,
      updated: 0,
    });
    expect(fixture.state.events).toHaveLength(1);
    expect(fixture.state.link.deliveryStatus).toBe("DELIVERED");

    expect(
      await recordResendAuthEvent(
        {
          eventId: "webhook_bounced",
          eventType: "email.bounced",
          occurredAt: new Date("2026-08-20T10:02:00.000Z"),
          providerMessageId: "resend_1",
          taggedAuthMagicLinkId: "link_1",
        },
        fixture.db,
      ),
    ).toEqual({ handled: true, updated: 1 });
    expect(fixture.state.link).toMatchObject({
      deliveryStatus: "BOUNCED",
      failureCode: "recipient_bounced",
    });
    expect(fixture.state.link.revokedAt).toEqual(
      new Date("2026-08-20T10:02:00.000Z"),
    );
    expect(fixture.state.verifications).toEqual([]);
  });
});

function deliveryFixture() {
  const state = {
    link: {
      id: "link_1",
      userId: "user_1",
      tokenHash: "token_hash_1",
      rotationGeneration: 1,
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
      failureCode: null as string | null,
      revokedAt: null as Date | null,
      createdAt: new Date("2026-08-20T10:00:00.000Z"),
    },
    events: [] as Array<{
      id: string;
      authMagicLinkId: string;
      providerMessageId: string;
      eventType: string;
      occurredAt: Date;
    }>,
    verifications: ["token_hash_1"],
    activeGeneration: 0,
  };
  const tx = {
    authMagicLink: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === state.link.id ? state.link : null,
      findFirst: async () => state.link,
      findMany: async () => [],
      updateMany: async (input: {
        where: {
          deliveryStatus?: { in: string[] };
          revokedAt?: null;
        };
        data: Partial<typeof state.link>;
      }) => {
        if (
          input.where.deliveryStatus &&
          !input.where.deliveryStatus.in.includes(state.link.deliveryStatus)
        ) {
          return { count: 0 };
        }
        if (input.where.revokedAt === null && state.link.revokedAt !== null) {
          return { count: 0 };
        }
        Object.assign(state.link, input.data);
        return { count: 1 };
      },
    },
    user: {
      updateMany: async () => {
        state.activeGeneration = 1;
        return { count: 1 };
      },
      findUniqueOrThrow: async () => ({
        authLinkActiveGeneration: state.activeGeneration,
      }),
    },
    authProviderEvent: {
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
    verification: {
      deleteMany: async ({ where }: { where: { identifier: string } }) => {
        state.verifications = state.verifications.filter(
          (value) => value !== where.identifier,
        );
        return { count: 1 };
      },
    },
  };
  const db = {
    $transaction: async (operation: (transaction: typeof tx) => Promise<unknown>) =>
      operation(tx),
  } as unknown as Pick<PrismaClient, "$transaction">;
  return { state, db };
}
