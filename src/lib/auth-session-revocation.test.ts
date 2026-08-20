import { describe, expect, it, mock } from "bun:test";
import type { PrismaClient } from "@/generated/prisma/client";
import type { CurrentSession } from "@/lib/auth-sessions";

mock.module("server-only", () => ({}));
mock.module("@/lib/better-auth", () => ({
  auth: { api: { getSession: async () => null } },
}));

const { revokeCurrentSessionAtomically } = await import(
  "@/lib/auth-sessions"
);

const current: CurrentSession = {
  id: "session_1",
  token: "token_1",
  userId: "user_1",
  purpose: "SITE",
  organizationId: "organization_1",
  siteId: "site_1",
  siteSlug: "restaurant-one",
  expiresAt: new Date("2026-08-21T00:00:00.000Z"),
};

describe("atomic session revocation evidence", () => {
  it("deletes the exact current session and records its evidence in one commit", async () => {
    const fixture = revocationFixture();

    await revokeCurrentSessionAtomically(current, fixture.db);

    expect(fixture.state.session).toBeNull();
    expect(fixture.state.events).toEqual([
      {
        type: "auth.session.revoked",
        actor: "user:self",
        subjectUserId: "user_1",
        sessionId: "session_1",
        siteId: "site_1",
        metadata: { provider: "better-auth" },
      },
    ]);
  });

  it("does not record evidence or report a commit when exact deletion fails", async () => {
    const fixture = revocationFixture({ deletionCount: 0 });

    await expect(
      revokeCurrentSessionAtomically(current, fixture.db),
    ).rejects.toThrow("already changed");

    expect(fixture.state.session).toEqual({
      id: "session_1",
      token: "token_1",
      userId: "user_1",
    });
    expect(fixture.state.events).toEqual([]);
  });

  it("rolls the exact session deletion back when the evidence insert fails", async () => {
    const fixture = revocationFixture({ failAudit: true });

    await expect(
      revokeCurrentSessionAtomically(current, fixture.db),
    ).rejects.toThrow("audit unavailable");

    expect(fixture.state.session).toEqual({
      id: "session_1",
      token: "token_1",
      userId: "user_1",
    });
    expect(fixture.state.events).toEqual([]);
  });
});

function revocationFixture(options: {
  deletionCount?: number;
  failAudit?: boolean;
} = {}) {
  type SessionRow = { id: string; token: string; userId: string };
  type EventRow = Record<string, unknown>;
  const state: { session: SessionRow | null; events: EventRow[] } = {
    session: { id: "session_1", token: "token_1", userId: "user_1" },
    events: [],
  };
  const db = {
    $transaction: async (
      operation: (transaction: {
        session: {
          deleteMany: (input: {
            where: SessionRow;
          }) => Promise<{ count: number }>;
        };
        authEvent: {
          create: (input: { data: EventRow }) => Promise<EventRow>;
        };
      }) => Promise<unknown>,
    ) => {
      let pendingSession = state.session ? { ...state.session } : null;
      const pendingEvents = [...state.events];
      const result = await operation({
        session: {
          deleteMany: async ({ where }) => {
            const matches =
              pendingSession?.id === where.id &&
              pendingSession.token === where.token &&
              pendingSession.userId === where.userId;
            const count = options.deletionCount ?? (matches ? 1 : 0);
            if (count === 1) pendingSession = null;
            return { count };
          },
        },
        authEvent: {
          create: async ({ data }) => {
            if (options.failAudit) throw new Error("audit unavailable");
            pendingEvents.push(data);
            return data;
          },
        },
      });
      state.session = pendingSession;
      state.events = pendingEvents;
      return result;
    },
  } as unknown as Pick<PrismaClient, "$transaction">;
  return { state, db };
}
