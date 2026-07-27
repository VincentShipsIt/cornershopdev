import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { AuthSessionPurpose } from "@/generated/prisma/enums";
import { getDb } from "@/lib/db";
import {
  createOpaqueAuthToken,
  hashAuthToken,
  SESSION_TTL_MS,
} from "@/lib/session";

export type CurrentSession = {
  id: string;
  userId: string;
  purpose: AuthSessionPurpose;
  organizationId: string | null;
  siteId: string | null;
  siteSlug: string | null;
  expiresAt: Date;
};

export type CreatedSession = {
  token: string;
  session: CurrentSession;
};

type CreateSessionInput = {
  userId: string;
  purpose: AuthSessionPurpose;
  organizationId?: string | null;
  site?: { id: string; slug: string } | null;
  actor: string;
  eventType?: "auth.session.created" | "auth.session.rotated";
  previousSessionId?: string;
  now?: Date;
};

export async function createSessionInTransaction(
  tx: Prisma.TransactionClient,
  input: CreateSessionInput,
): Promise<CreatedSession> {
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  const credential = createOpaqueAuthToken();
  const organizationId = input.organizationId ?? null;
  const site = input.site ?? null;
  assertSessionBinding(input.purpose, organizationId, site);

  const row = await tx.authSession.create({
    data: {
      tokenHash: credential.tokenHash,
      purpose: input.purpose,
      expiresAt,
      userId: input.userId,
      organizationId,
      siteId: site?.id ?? null,
    },
    select: { id: true },
  });
  await tx.authEvent.create({
    data: {
      type: input.eventType ?? "auth.session.created",
      actor: input.actor,
      subjectUserId: input.userId,
      sessionId: row.id,
      siteId: site?.id ?? null,
      metadata: {
        purpose: input.purpose,
        previousSessionId: input.previousSessionId ?? null,
        expiresAt: expiresAt.toISOString(),
      },
    },
  });
  return {
    token: credential.token,
    session: {
      id: row.id,
      userId: input.userId,
      purpose: input.purpose,
      organizationId,
      siteId: site?.id ?? null,
      siteSlug: site?.slug ?? null,
      expiresAt,
    },
  };
}

export async function resolveSessionToken(
  token: string,
  now = new Date(),
): Promise<CurrentSession | null> {
  if (!process.env.DATABASE_URL) return null;
  const row = await getDb().authSession.findUnique({
    where: { tokenHash: hashAuthToken(token) },
    select: {
      id: true,
      userId: true,
      purpose: true,
      organizationId: true,
      siteId: true,
      expiresAt: true,
      revokedAt: true,
      site: { select: { slug: true, organizationId: true } },
    },
  });
  if (!row || row.revokedAt || row.expiresAt <= now) return null;
  if (
    row.purpose === "SITE" &&
    (!row.siteId ||
      !row.organizationId ||
      !row.site ||
      row.site.organizationId !== row.organizationId)
  ) {
    return null;
  }
  if (
    row.purpose !== "SITE" &&
    (row.siteId || row.organizationId || row.site)
  ) {
    return null;
  }

  return {
    id: row.id,
    userId: row.userId,
    purpose: row.purpose,
    organizationId: row.organizationId,
    siteId: row.siteId,
    siteSlug: row.site?.slug ?? null,
    expiresAt: row.expiresAt,
  };
}

export async function createSiteSession(input: {
  userId: string;
  siteId: string;
  actor: string;
  previousToken?: string | null;
}): Promise<CreatedSession> {
  const now = new Date();
  return getDb().$transaction(
    async (tx) => {
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
      const previous = input.previousToken
        ? await revokeSessionInTransaction(tx, {
            tokenHash: hashAuthToken(input.previousToken),
            userId: input.userId,
            actor: input.actor,
            now,
            audit: false,
          })
        : null;
      return createSessionInTransaction(tx, {
        userId: input.userId,
        purpose: "SITE",
        organizationId: site.organizationId,
        site: { id: site.id, slug: site.slug },
        actor: input.actor,
        eventType: previous ? "auth.session.rotated" : "auth.session.created",
        previousSessionId: previous?.id,
        now,
      });
    },
    { isolationLevel: "Serializable" },
  );
}

export async function rotateSessionToWorkspace(input: {
  currentToken: string;
  siteId: string;
}): Promise<CreatedSession> {
  const now = new Date();
  return getDb().$transaction(
    async (tx) => {
      const current = await tx.authSession.findUnique({
        where: { tokenHash: hashAuthToken(input.currentToken) },
        select: {
          id: true,
          userId: true,
          expiresAt: true,
          revokedAt: true,
        },
      });
      if (!current || current.revokedAt || current.expiresAt <= now) {
        throw new AuthSessionError("Your session has expired.");
      }
      const site = await tx.site.findFirst({
        where: {
          id: input.siteId,
          organization: {
            memberships: { some: { userId: current.userId } },
          },
        },
        select: { id: true, slug: true, organizationId: true },
      });
      if (!site?.organizationId) {
        throw new AuthSessionError("Workspace access is no longer available.");
      }
      const revoked = await tx.authSession.updateMany({
        where: {
          id: current.id,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { revokedAt: now },
      });
      if (revoked.count !== 1) {
        throw new AuthSessionError("Your session changed. Sign in again.");
      }
      return createSessionInTransaction(tx, {
        userId: current.userId,
        purpose: "SITE",
        organizationId: site.organizationId,
        site: { id: site.id, slug: site.slug },
        actor: `user:${current.userId}`,
        eventType: "auth.session.rotated",
        previousSessionId: current.id,
        now,
      });
    },
    { isolationLevel: "Serializable" },
  );
}

export async function revokeCurrentSession(
  token: string,
): Promise<boolean> {
  const now = new Date();
  return getDb().$transaction(async (tx) => {
    const revoked = await revokeSessionInTransaction(tx, {
      tokenHash: hashAuthToken(token),
      actor: "user:self",
      now,
      audit: true,
    });
    return Boolean(revoked);
  });
}

async function revokeSessionInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    tokenHash: string;
    userId?: string;
    actor: string;
    now: Date;
    audit: boolean;
  },
): Promise<{ id: string; userId: string; siteId: string | null } | null> {
  const session = await tx.authSession.findUnique({
    where: { tokenHash: input.tokenHash },
    select: {
      id: true,
      userId: true,
      siteId: true,
      revokedAt: true,
      expiresAt: true,
    },
  });
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= input.now ||
    (input.userId && session.userId !== input.userId)
  ) {
    return null;
  }
  const revoked = await tx.authSession.updateMany({
    where: {
      id: session.id,
      revokedAt: null,
      expiresAt: { gt: input.now },
    },
    data: { revokedAt: input.now },
  });
  if (revoked.count !== 1) return null;
  if (input.audit) {
    await tx.authEvent.create({
      data: {
        type: "auth.session.revoked",
        actor: input.actor,
        subjectUserId: session.userId,
        sessionId: session.id,
        siteId: session.siteId,
      },
    });
  }
  return session;
}

function assertSessionBinding(
  purpose: AuthSessionPurpose,
  organizationId: string | null,
  site: { id: string; slug: string } | null,
): void {
  if (purpose === "SITE") {
    if (!organizationId || !site) {
      throw new Error("A site session requires organization and site binding.");
    }
    return;
  }
  if (organizationId || site) {
    throw new Error("An unbound session cannot carry tenant identifiers.");
  }
}

export class AuthSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthSessionError";
  }
}
