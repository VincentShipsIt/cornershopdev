import { describe, expect, it, mock } from "bun:test";
import {
  persistWorkspaceRotation,
  rotateWorkspaceSession,
  workspaceSessionCreationArguments,
} from "@/lib/workspace-auth-plugin";

const current = {
  currentSessionId: "session_old",
  currentSessionToken: "token_old",
  siteId: "site_1",
  userId: "user_1",
};
const created = { id: "session_new", token: "token_new" };

describe("Better Auth workspace session rotation", () => {
  it("uses Better Auth's final override slot for the selected SITE binding", () => {
    expect(
      workspaceSessionCreationArguments({
        userId: "user_1",
        siteId: "site_1",
        organizationId: "organization_1",
        purpose: "SITE",
      }),
    ).toEqual([
      "user_1",
      false,
      {
        purpose: "SITE",
        organizationId: "organization_1",
        siteId: "site_1",
      },
      true,
    ]);
  });

  it("deletes the exact old token and audits both session IDs atomically", async () => {
    const deleted: unknown[] = [];
    const audited: unknown[] = [];
    await persistWorkspaceRotation(
      {
        currentSessionId: "session_old",
        currentSessionToken: "token_old",
        createdSessionId: "session_new",
        siteId: "site_1",
        organizationId: "organization_1",
        userId: "user_1",
      },
      {
        session: {
          deleteMany: async (input) => {
            deleted.push(input);
            return { count: 1 };
          },
        },
        authEvent: {
          create: async (input) => {
            audited.push(input);
            return input;
          },
        },
      },
    );

    expect(deleted).toEqual([
      {
        where: {
          id: "session_old",
          token: "token_old",
          userId: "user_1",
        },
      },
    ]);
    expect(audited).toEqual([
      {
        data: {
          type: "auth.session.rotated",
          actor: "user:user_1",
          subjectUserId: "user_1",
          sessionId: "session_new",
          siteId: "site_1",
          metadata: {
            provider: "better-auth",
            purpose: "SITE",
            organizationId: "organization_1",
            previousSessionId: "session_old",
            currentSessionId: "session_new",
          },
        },
      },
    ]);
  });

  it("issues a fresh SITE session, sets its cookie, and persists old/new audit identity", async () => {
    const rotations: unknown[] = [];
    const dependencies = {
      findOwnedSite: mock(async () => ({
        id: "site_1",
        organizationId: "organization_1",
      })),
      createSession: mock(async () => created),
      setSessionCookie: mock(async () => undefined),
      persistRotation: mock(async (rotation: unknown) => {
        rotations.push(rotation);
      }),
      deleteSession: mock(async () => undefined),
      clearSessionCookie: mock(() => undefined),
    };

    await expect(
      rotateWorkspaceSession(current, dependencies),
    ).resolves.toEqual({
      session: created,
      site: { id: "site_1", organizationId: "organization_1" },
    });
    expect(dependencies.findOwnedSite).toHaveBeenCalledWith({
      siteId: "site_1",
      membershipWhere: { userId: "user_1", role: "owner" },
    });
    expect(dependencies.createSession).toHaveBeenCalledWith({
      userId: "user_1",
      siteId: "site_1",
      organizationId: "organization_1",
      purpose: "SITE",
    });
    expect(dependencies.setSessionCookie).toHaveBeenCalledWith(created);
    expect(created.id).not.toBe(current.currentSessionId);
    expect(created.token).not.toBe(current.currentSessionToken);
    expect(rotations).toEqual([
      {
        currentSessionId: "session_old",
        currentSessionToken: "token_old",
        createdSessionId: "session_new",
        siteId: "site_1",
        organizationId: "organization_1",
        userId: "user_1",
      },
    ]);
    expect(dependencies.deleteSession).not.toHaveBeenCalled();
    expect(dependencies.clearSessionCookie).not.toHaveBeenCalled();
  });

  it("refuses a non-owner workspace before creating a session", async () => {
    const dependencies = {
      findOwnedSite: mock(async () => null),
      createSession: mock(async () => created),
      setSessionCookie: mock(async () => undefined),
      persistRotation: mock(async () => undefined),
      deleteSession: mock(async () => undefined),
      clearSessionCookie: mock(() => undefined),
    };

    await expect(
      rotateWorkspaceSession(current, dependencies),
    ).rejects.toMatchObject({ status: "FORBIDDEN" });
    expect(dependencies.findOwnedSite).toHaveBeenCalledWith({
      siteId: "site_1",
      membershipWhere: { userId: "user_1", role: "owner" },
    });
    expect(dependencies.createSession).not.toHaveBeenCalled();
    expect(dependencies.setSessionCookie).not.toHaveBeenCalled();
  });

  it("deletes the new session and clears its cookie when old-session revocation fails", async () => {
    const dependencies = {
      findOwnedSite: mock(async () => ({
        id: "site_1",
        organizationId: "organization_1",
      })),
      createSession: mock(async () => created),
      setSessionCookie: mock(async () => undefined),
      persistRotation: mock(async () => {
        throw new Error("old session changed");
      }),
      deleteSession: mock(async () => undefined),
      clearSessionCookie: mock(() => undefined),
    };

    await expect(
      rotateWorkspaceSession(current, dependencies),
    ).rejects.toThrow("old session changed");
    expect(dependencies.setSessionCookie).toHaveBeenCalledWith(created);
    expect(dependencies.deleteSession).toHaveBeenCalledWith("token_new");
    expect(dependencies.clearSessionCookie).toHaveBeenCalledTimes(1);
  });
});
