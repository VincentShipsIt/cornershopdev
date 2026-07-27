import "server-only";
import { auth } from "@/lib/better-auth";
import {
  isSessionPurpose,
  type SessionPurpose,
} from "@/lib/auth-session-binding";
import { getDb } from "@/lib/db";

export type CurrentSession = {
  id: string;
  userId: string;
  purpose: SessionPurpose;
  organizationId: string | null;
  siteId: string | null;
  siteSlug: string | null;
  expiresAt: Date;
};

export async function resolveBetterAuthSession(
  requestHeaders: Headers,
): Promise<CurrentSession | null> {
  if (!process.env.DATABASE_URL) return null;
  const result = await auth.api
    .getSession({
      headers: requestHeaders,
      query: { disableCookieCache: true },
    })
    .catch(() => null);
  if (!result) return null;

  const raw = result.session as typeof result.session & {
    purpose?: unknown;
    organizationId?: unknown;
    siteId?: unknown;
  };
  if (!isSessionPurpose(raw.purpose)) return null;
  const organizationId =
    typeof raw.organizationId === "string" ? raw.organizationId : null;
  const siteId = typeof raw.siteId === "string" ? raw.siteId : null;
  const expiresAt = new Date(raw.expiresAt);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) {
    return null;
  }

  if (raw.purpose !== "SITE") {
    if (organizationId || siteId) return null;
    return {
      id: raw.id,
      userId: raw.userId,
      purpose: raw.purpose,
      organizationId: null,
      siteId: null,
      siteSlug: null,
      expiresAt,
    };
  }
  if (!organizationId || !siteId) return null;

  const site = await getDb().site.findFirst({
    where: { id: siteId, organizationId },
    select: { slug: true },
  });
  if (!site) return null;
  return {
    id: raw.id,
    userId: raw.userId,
    purpose: raw.purpose,
    organizationId,
    siteId,
    siteSlug: site.slug,
    expiresAt,
  };
}

export async function rotateSessionToWorkspace(input: {
  sessionId: string;
  userId: string;
  siteId: string;
}): Promise<CurrentSession> {
  const now = new Date();
  return getDb().$transaction(
    async (tx) => {
      const current = await tx.session.findFirst({
        where: {
          id: input.sessionId,
          userId: input.userId,
          expiresAt: { gt: now },
        },
        select: { id: true, expiresAt: true },
      });
      if (!current) throw new AuthSessionError("Your session has expired.");

      const site = await tx.site.findFirst({
        where: {
          id: input.siteId,
          organization: {
            memberships: { some: { userId: input.userId } },
          },
        },
        select: { id: true, slug: true, organizationId: true },
      });
      if (!site?.organizationId) {
        throw new AuthSessionError("Workspace access is no longer available.");
      }

      const updated = await tx.session.updateMany({
        where: {
          id: current.id,
          userId: input.userId,
          expiresAt: { gt: now },
        },
        data: {
          purpose: "SITE",
          organizationId: site.organizationId,
          siteId: site.id,
        },
      });
      if (updated.count !== 1) {
        throw new AuthSessionError("Your session changed. Sign in again.");
      }
      await tx.authEvent.create({
        data: {
          type: "auth.session.context_changed",
          actor: `user:${input.userId}`,
          subjectUserId: input.userId,
          sessionId: current.id,
          siteId: site.id,
          metadata: {
            provider: "better-auth",
            purpose: "SITE",
            organizationId: site.organizationId,
          },
        },
      });
      return {
        id: current.id,
        userId: input.userId,
        purpose: "SITE",
        organizationId: site.organizationId,
        siteId: site.id,
        siteSlug: site.slug,
        expiresAt: current.expiresAt,
      };
    },
    { isolationLevel: "Serializable" },
  );
}

export async function recordSessionRevocation(
  session: CurrentSession,
): Promise<void> {
  await getDb().authEvent.create({
    data: {
      type: "auth.session.revoked",
      actor: "user:self",
      subjectUserId: session.userId,
      sessionId: session.id,
      siteId: session.siteId,
      metadata: { provider: "better-auth" },
    },
  });
}

export class AuthSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthSessionError";
  }
}
