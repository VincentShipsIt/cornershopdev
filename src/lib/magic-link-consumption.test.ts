import { describe, expect, it, mock } from "bun:test";
import type { PrismaClient } from "@/generated/prisma/client";
import { hashAuthToken } from "@/lib/session";

mock.module("server-only", () => ({}));

const verifyRouteSource = await Bun.file(
  new URL("../app/api/auth/verify/route.ts", import.meta.url),
).text();

describe("generation-bound magic-link consumption", () => {
  it("admits only the current delivered generation before Better Auth consumes it", async () => {
    const { isMagicLinkConsumable } = await import(
      "@/lib/magic-link-consumption"
    );
    const fixture = consumptionFixture({
      activeGeneration: 2,
      generation: 2,
      deliveryStatus: "DELIVERED",
    });

    expect(await isMagicLinkConsumable("token_2", fixture.db)).toBe(true);
    fixture.state.activeGeneration = 3;
    expect(await isMagicLinkConsumable("token_2", fixture.db)).toBe(false);
    fixture.state.activeGeneration = 2;
    fixture.state.deliveryStatus = "PENDING";
    expect(await isMagicLinkConsumable("token_2", fixture.db)).toBe(false);
    expect(verifyRouteSource).toContain(
      "await isMagicLinkConsumable(token)",
    );
    expect(
      verifyRouteSource.indexOf("await isMagicLinkConsumable(token)"),
    ).toBeLessThan(verifyRouteSource.indexOf("const verification"));
  });

  it("locks the active generation and records consumption atomically", async () => {
    const { markMagicLinkConsumed } = await import(
      "@/lib/magic-link-consumption"
    );
    const fixture = consumptionFixture({
      activeGeneration: 2,
      generation: 2,
      deliveryStatus: "SENT",
    });

    await markMagicLinkConsumed("token_2", fixture.dbWithTransaction);

    expect(fixture.state.consumedAt).toBeInstanceOf(Date);
    expect(fixture.state.events).toEqual([
      expect.objectContaining({
        type: "auth.magic_link.consumed",
        magicLinkId: "link_2",
      }),
    ]);
  });

  it("cannot consume an older generation after a newer send wins", async () => {
    const { markMagicLinkConsumed } = await import(
      "@/lib/magic-link-consumption"
    );
    const fixture = consumptionFixture({
      activeGeneration: 3,
      generation: 2,
      deliveryStatus: "DELIVERED",
    });

    await expect(
      markMagicLinkConsumed("token_2", fixture.dbWithTransaction),
    ).rejects.toThrow("Authentication delivery evidence changed.");
    expect(fixture.state.consumedAt).toBeNull();
    expect(fixture.state.events).toEqual([]);
  });
});

function consumptionFixture(input: {
  activeGeneration: number;
  generation: number;
  deliveryStatus: "PENDING" | "SENT" | "DELIVERED";
}) {
  const state = {
    activeGeneration: input.activeGeneration,
    generation: input.generation,
    deliveryStatus: input.deliveryStatus,
    consumedAt: null as Date | null,
    revokedAt: null as Date | null,
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    events: [] as Array<Record<string, unknown>>,
  };
  const authMagicLink = {
    findUnique: async ({ where }: { where: { tokenHash: string } }) =>
      where.tokenHash === hashAuthToken(`token_${state.generation}`)
        ? {
            id: `link_${state.generation}`,
            userId: "user_1",
            rotationGeneration: state.generation,
            deliveryStatus: state.deliveryStatus,
            expiresAt: state.expiresAt,
            consumedAt: state.consumedAt,
            revokedAt: state.revokedAt,
            user: { authLinkActiveGeneration: state.activeGeneration },
          }
        : null,
    updateMany: async () => {
      if (
        state.deliveryStatus !== "SENT" &&
        state.deliveryStatus !== "DELIVERED"
      ) {
        return { count: 0 };
      }
      state.consumedAt = new Date();
      return { count: 1 };
    },
  };
  const transaction = {
    authMagicLink,
    user: {
      updateMany: async () => ({
        count: state.activeGeneration === state.generation ? 1 : 0,
      }),
    },
    authEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.events.push(data);
        return data;
      },
    },
  };
  return {
    state,
    db: { authMagicLink } as unknown as Pick<
      PrismaClient,
      "authMagicLink"
    >,
    dbWithTransaction: {
      $transaction: async (
        operation: (tx: typeof transaction) => Promise<unknown>,
      ) => operation(transaction),
    } as unknown as Pick<PrismaClient, "$transaction">,
  };
}
