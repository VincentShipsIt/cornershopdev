import { describe, expect, it, mock } from "bun:test";
import type { PrismaClient } from "@/generated/prisma/client";

mock.module("server-only", () => ({}));

const { finalizeMagicLinkDelivery } = await import(
  "@/lib/magic-link-delivery"
);
const { recordResendAuthEvent } = await import(
  "@/lib/auth-delivery-event-recorder"
);

describe("monotonic magic-link rotation", () => {
  it("keeps a webhook-delivered replacement monotonic and revokes every older link", async () => {
    const fixture = rotationFixture({
      activeGeneration: 1,
      links: [
        link(1, "SENT", "message_1"),
        link(2, "DELIVERED", "message_2"),
      ],
    });

    await finalizeMagicLinkDelivery(accepted(2), fixture.db);

    expect(fixture.link(2)).toMatchObject({
      deliveryStatus: "DELIVERED",
      revokedAt: null,
      providerMessageId: "message_2",
    });
    expect(fixture.link(1).revokedAt).toBeInstanceOf(Date);
    expect(fixture.state.activeGeneration).toBe(2);
    expect(fixture.state.verifications).toEqual(["token_hash_2"]);
  });

  it("allows a signed webhook to advance after finalization without reviving an older link", async () => {
    const fixture = rotationFixture({
      activeGeneration: 1,
      links: [link(1, "SENT", "message_1"), link(2, "PENDING")],
    });

    await finalizeMagicLinkDelivery(accepted(2), fixture.db);
    expect(fixture.link(2).deliveryStatus).toBe("SENT");
    expect(
      await recordResendAuthEvent(
        {
          eventId: "event_delivered_2",
          eventType: "email.delivered",
          occurredAt: new Date("2026-08-20T16:00:00.000Z"),
          providerMessageId: "message_2",
          taggedAuthMagicLinkId: "link_2",
        },
        fixture.db,
      ),
    ).toEqual({ handled: true, updated: 1 });

    expect(fixture.link(2)).toMatchObject({
      deliveryStatus: "DELIVERED",
      revokedAt: null,
    });
    expect(fixture.link(1).revokedAt).toBeInstanceOf(Date);
    expect(fixture.state.verifications).toEqual(["token_hash_2"]);
  });

  it("makes the newer successful generation win when sends finalize out of order", async () => {
    const fixture = rotationFixture({
      activeGeneration: 1,
      links: [
        link(1, "SENT", "message_1"),
        link(2, "PENDING"),
        link(3, "PENDING"),
      ],
    });

    await finalizeMagicLinkDelivery(accepted(3), fixture.db);
    await finalizeMagicLinkDelivery(accepted(2), fixture.db);

    expect(fixture.state.activeGeneration).toBe(3);
    expect(fixture.link(3).revokedAt).toBeNull();
    expect(fixture.link(2).revokedAt).toBeInstanceOf(Date);
    expect(fixture.link(1).revokedAt).toBeInstanceOf(Date);
    expect(fixture.state.verifications).toEqual(["token_hash_3"]);
  });

  it("preserves the previous usable link when a retry send fails", async () => {
    const fixture = rotationFixture({
      activeGeneration: 1,
      links: [link(1, "SENT", "message_1"), link(2, "PENDING")],
    });

    await finalizeMagicLinkDelivery(
      {
        id: "link_2",
        rotationGeneration: 2,
        outcome: "FAILED",
        providerMessageId: null,
        failureCode: "provider_error",
      },
      fixture.db,
    );

    expect(fixture.state.activeGeneration).toBe(1);
    expect(fixture.link(1).revokedAt).toBeNull();
    expect(fixture.link(2)).toMatchObject({
      deliveryStatus: "FAILED",
      failureCode: "provider_error",
    });
    expect(fixture.link(2).revokedAt).toBeInstanceOf(Date);
    expect(fixture.state.verifications).toEqual(["token_hash_1"]);
  });
});

type DeliveryStatus =
  | "PENDING"
  | "SENT"
  | "DELIVERED"
  | "FAILED"
  | "BOUNCED"
  | "SUPPRESSED";

type LinkRow = {
  id: string;
  userId: string;
  tokenHash: string;
  rotationGeneration: number;
  deliveryStatus: DeliveryStatus;
  deliveryAttempts: number;
  providerMessageId: string | null;
  providerEventAt: Date | null;
  failureCode: string | null;
  deliveredAt: Date | null;
  lastAttemptAt: Date | null;
  consumedAt: Date | null;
  revokedAt: Date | null;
};

function link(
  generation: number,
  deliveryStatus: DeliveryStatus,
  providerMessageId: string | null = null,
): LinkRow {
  return {
    id: `link_${generation}`,
    userId: "user_1",
    tokenHash: `token_hash_${generation}`,
    rotationGeneration: generation,
    deliveryStatus,
    deliveryAttempts: 0,
    providerMessageId,
    providerEventAt: null,
    failureCode: null,
    deliveredAt: null,
    lastAttemptAt: null,
    consumedAt: null,
    revokedAt: null,
  };
}

function accepted(generation: number) {
  return {
    id: `link_${generation}`,
    rotationGeneration: generation,
    outcome: "ACCEPTED" as const,
    providerMessageId: `message_${generation}`,
    failureCode: null,
  };
}

function rotationFixture(input: {
  activeGeneration: number;
  links: LinkRow[];
}) {
  const state = {
    activeGeneration: input.activeGeneration,
    links: structuredClone(input.links),
    verifications: input.links.map((row) => row.tokenHash),
    events: [] as Array<Record<string, unknown>>,
    providerEvents: [] as Array<Record<string, unknown>>,
  };
  const tx = {
    authMagicLink: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        state.links.find((row) => row.id === where.id) ?? null,
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const row = state.links.find((candidate) => candidate.id === where.id);
        if (!row) throw new Error("link not found");
        return row;
      },
      findFirst: async ({ where }: { where: { providerMessageId: string } }) =>
        state.links.find(
          (row) => row.providerMessageId === where.providerMessageId,
        ) ?? null,
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        state.links.filter((row) => matchesLink(row, where)),
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const rows = state.links.filter((row) => matchesLink(row, where));
        for (const row of rows) applyLinkUpdate(row, data);
        return { count: rows.length };
      },
    },
    user: {
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          id: string;
          authLinkActiveGeneration: { lt: number };
        };
        data: { authLinkActiveGeneration: number };
      }) => {
        if (
          where.id !== "user_1" ||
          state.activeGeneration >= where.authLinkActiveGeneration.lt
        ) {
          return { count: 0 };
        }
        state.activeGeneration = data.authLinkActiveGeneration;
        return { count: 1 };
      },
      findUniqueOrThrow: async () => ({
        authLinkActiveGeneration: state.activeGeneration,
      }),
    },
    verification: {
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        const identifiers = where.identifier as
          | string
          | { in: string[] };
        const removed =
          typeof identifiers === "string" ? [identifiers] : identifiers.in;
        state.verifications = state.verifications.filter(
          (value) => !removed.includes(value),
        );
        return { count: removed.length };
      },
    },
    authEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.events.push(data);
        return data;
      },
    },
    authProviderEvent: {
      upsert: async ({
        where,
        create,
      }: {
        where: { id: string };
        create: Record<string, unknown>;
      }) => {
        const existing = state.providerEvents.find(
          (event) => event.id === where.id,
        );
        if (existing) return existing;
        state.providerEvents.push(create);
        return create;
      },
    },
  };
  const db = {
    $transaction: async (
      operation: (transaction: typeof tx) => Promise<unknown>,
    ) => operation(tx),
  } as unknown as Pick<PrismaClient, "$transaction">;
  return {
    state,
    db,
    link: (generation: number) =>
      state.links.find(
        (row) => row.rotationGeneration === generation,
      )!,
  };
}

function matchesLink(row: LinkRow, where: Record<string, unknown>): boolean {
  if (typeof where.id === "string" && row.id !== where.id) return false;
  if (
    where.id &&
    typeof where.id === "object" &&
    "in" in where.id &&
    !(where.id.in as string[]).includes(row.id)
  ) {
    return false;
  }
  if (typeof where.userId === "string" && row.userId !== where.userId) {
    return false;
  }
  if (
    typeof where.rotationGeneration === "number" &&
    row.rotationGeneration !== where.rotationGeneration
  ) {
    return false;
  }
  if (where.rotationGeneration && typeof where.rotationGeneration === "object") {
    const generation = where.rotationGeneration as {
      lt?: number;
      equals?: number;
    };
    if (generation.lt !== undefined && row.rotationGeneration >= generation.lt) {
      return false;
    }
    if (
      generation.equals !== undefined &&
      row.rotationGeneration !== generation.equals
    ) {
      return false;
    }
  }
  if (
    typeof where.deliveryStatus === "string" &&
    row.deliveryStatus !== where.deliveryStatus
  ) {
    return false;
  }
  if (where.consumedAt === null && row.consumedAt !== null) return false;
  if (where.revokedAt === null && row.revokedAt !== null) return false;
  if (Array.isArray(where.OR)) {
    const matchesProvider = (where.OR as Array<Record<string, unknown>>).some(
      (condition) =>
        condition.providerMessageId === row.providerMessageId,
    );
    if (!matchesProvider) return false;
  }
  return true;
}

function applyLinkUpdate(row: LinkRow, data: Record<string, unknown>) {
  if (data.deliveryAttempts) row.deliveryAttempts += 1;
  if (typeof data.providerMessageId === "string") {
    row.providerMessageId = data.providerMessageId;
  }
  if (data.lastAttemptAt instanceof Date) row.lastAttemptAt = data.lastAttemptAt;
  if (typeof data.deliveryStatus === "string") {
    row.deliveryStatus = data.deliveryStatus as DeliveryStatus;
  }
  if (data.failureCode === null || typeof data.failureCode === "string") {
    row.failureCode = data.failureCode;
  }
  if (data.providerEventAt instanceof Date) row.providerEventAt = data.providerEventAt;
  if (data.deliveredAt instanceof Date) row.deliveredAt = data.deliveredAt;
  if (data.revokedAt instanceof Date) row.revokedAt = data.revokedAt;
}
