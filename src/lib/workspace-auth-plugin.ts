import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { deleteSessionCookie, setSessionCookie } from "better-auth/cookies";
import type { BetterAuthPlugin } from "better-auth/types";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { ownerMembershipWhere } from "@/lib/owner-membership";

const workspaceSelectionSchema = z.object({
  siteId: z.string().min(1).max(128),
});

type OwnedWorkspace = { id: string; organizationId: string | null };
type ResolvedOwnedWorkspace = { id: string; organizationId: string };
type CreatedWorkspaceSession = { id: string; token: string };

type WorkspaceRotation = {
  currentSessionId: string;
  currentSessionToken: string;
  createdSessionId: string;
  siteId: string;
  organizationId: string;
  userId: string;
};

type WorkspaceRotationStore = {
  session: {
    deleteMany: (input: {
      where: { id: string; token: string; userId: string };
    }) => Promise<{ count: number }>;
  };
  authEvent: {
    create: (input: Prisma.AuthEventCreateArgs) => PromiseLike<unknown>;
  };
};

type WorkspaceRotationDependencies<Session extends CreatedWorkspaceSession> = {
  findOwnedSite: (input: {
    siteId: string;
    membershipWhere: ReturnType<typeof ownerMembershipWhere>;
  }) => Promise<OwnedWorkspace | null>;
  createSession: (input: {
    userId: string;
    siteId: string;
    organizationId: string;
    purpose: "SITE";
  }) => Promise<Session | null>;
  setSessionCookie: (session: Session) => Promise<void>;
  persistRotation: (rotation: WorkspaceRotation) => Promise<void>;
  deleteSession: (token: string) => Promise<void>;
  clearSessionCookie: () => void;
};

export async function rotateWorkspaceSession<
  Session extends CreatedWorkspaceSession,
>(
  input: {
    currentSessionId: string;
    currentSessionToken: string;
    siteId: string;
    userId: string;
  },
  dependencies: WorkspaceRotationDependencies<Session>,
): Promise<{ session: Session; site: ResolvedOwnedWorkspace }> {
  const site = await dependencies.findOwnedSite({
    siteId: input.siteId,
    membershipWhere: ownerMembershipWhere(input.userId),
  });
  if (!site?.organizationId) {
    throw new APIError("FORBIDDEN", {
      message: "Workspace access is no longer available",
    });
  }
  const ownedSite: ResolvedOwnedWorkspace = {
    id: site.id,
    organizationId: site.organizationId,
  };

  const created = await dependencies.createSession({
    userId: input.userId,
    organizationId: ownedSite.organizationId,
    siteId: ownedSite.id,
    purpose: "SITE",
  });
  if (!created) {
    throw new APIError("INTERNAL_SERVER_ERROR", {
      message: "Workspace session could not be created",
    });
  }

  try {
    await dependencies.setSessionCookie(created);
    await dependencies.persistRotation({
      currentSessionId: input.currentSessionId,
      currentSessionToken: input.currentSessionToken,
      createdSessionId: created.id,
      siteId: ownedSite.id,
      organizationId: ownedSite.organizationId,
      userId: input.userId,
    });
  } catch (error) {
    await dependencies.deleteSession(created.token).catch(() => undefined);
    dependencies.clearSessionCookie();
    throw error;
  }

  return { session: created, site: ownedSite };
}

export async function persistWorkspaceRotation(
  rotation: WorkspaceRotation,
  store: WorkspaceRotationStore,
): Promise<void> {
  const revoked = await store.session.deleteMany({
    where: {
      id: rotation.currentSessionId,
      token: rotation.currentSessionToken,
      userId: rotation.userId,
    },
  });
  if (revoked.count !== 1) {
    throw new Error("The previous session was already changed");
  }
  await store.authEvent.create({
    data: {
      type: "auth.session.rotated",
      actor: `user:${rotation.userId}`,
      subjectUserId: rotation.userId,
      sessionId: rotation.createdSessionId,
      siteId: rotation.siteId,
      metadata: {
        provider: "better-auth",
        purpose: "SITE",
        organizationId: rotation.organizationId,
        previousSessionId: rotation.currentSessionId,
        currentSessionId: rotation.createdSessionId,
      },
    },
  });
}

export function workspaceAuthPlugin(): BetterAuthPlugin {
  return {
    id: "cornershop-workspace-auth",
    endpoints: {
      selectWorkspace: createAuthEndpoint(
        "/workspace/select",
        {
          method: "POST",
          requireHeaders: true,
          use: [sessionMiddleware],
          body: workspaceSelectionSchema,
        },
        async (ctx) => {
          const current = ctx.context.session;
          const currentSession = current.session as typeof current.session & {
            purpose?: unknown;
          };
          if (
            currentSession.purpose !== "WORKSPACE_SELECTION" &&
            currentSession.purpose !== "SITE"
          ) {
            throw new APIError("FORBIDDEN", {
              message: "Workspace selection is unavailable",
            });
          }

          await rotateWorkspaceSession(
            {
              currentSessionId: current.session.id,
              currentSessionToken: current.session.token,
              siteId: ctx.body.siteId,
              userId: current.user.id,
            },
            {
              findOwnedSite: ({ siteId, membershipWhere }) =>
                getDb().site.findFirst({
                  where: {
                    id: siteId,
                    organization: {
                      memberships: { some: membershipWhere },
                    },
                  },
                  select: { id: true, organizationId: true },
                }),
              createSession: ({ userId, organizationId, siteId, purpose }) =>
                ctx.context.internalAdapter.createSession(userId, false, {
                  purpose,
                  organizationId,
                  siteId,
                }),
              setSessionCookie: (session) =>
                setSessionCookie(ctx, {
                  session,
                  user: current.user,
                }),
              persistRotation: async (rotation) => {
                await getDb().$transaction(async (tx) => {
                  await persistWorkspaceRotation(rotation, tx);
                });
              },
              deleteSession: (token) =>
                ctx.context.internalAdapter.deleteSession(token),
              clearSessionCookie: () => deleteSessionCookie(ctx),
            },
          );

          return ctx.json({ ok: true, url: "/dashboard" });
        },
      ),
    },
  };
}
