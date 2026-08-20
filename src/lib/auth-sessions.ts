import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { auth } from "@/lib/better-auth";
import {
  isSessionPurpose,
  type SessionPurpose,
} from "@/lib/auth-session-binding";
import { getDb } from "@/lib/db";
import { ownedSiteSessionWhere } from "@/lib/owner-membership";

export type CurrentSession = {
  id: string;
  token: string;
  userId: string;
  purpose: SessionPurpose;
  organizationId: string | null;
  siteId: string | null;
  siteSlug: string | null;
  expiresAt: Date;
};

export async function resolveBetterAuthSession(
  requestHeaders: Headers,
  options: {
    failOnSessionLookupError?: boolean;
    requireOwnerMembership?: boolean;
  } = {},
): Promise<CurrentSession | null> {
  if (!process.env.DATABASE_URL) {
    if (options.failOnSessionLookupError) {
      throw new Error("Authentication database is unavailable");
    }
    return null;
  }
  let result;
  try {
    result = await auth.api.getSession({
      headers: requestHeaders,
      query: { disableCookieCache: true },
    });
  } catch (error) {
    if (options.failOnSessionLookupError) throw error;
    return null;
  }
  if (!result) return null;

  const raw = result.session as typeof result.session & {
    purpose?: unknown;
    organizationId?: unknown;
    siteId?: unknown;
  };
  if (!isSessionPurpose(raw.purpose)) return null;
  if (typeof raw.token !== "string" || raw.token.length === 0) return null;
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
      token: raw.token,
      userId: raw.userId,
      purpose: raw.purpose,
      organizationId: null,
      siteId: null,
      siteSlug: null,
      expiresAt,
    };
  }
  if (!organizationId || !siteId) return null;

  if (options.requireOwnerMembership === false) {
    return {
      id: raw.id,
      token: raw.token,
      userId: raw.userId,
      purpose: raw.purpose,
      organizationId,
      siteId,
      siteSlug: null,
      expiresAt,
    };
  }

  const site = await getDb().site.findFirst({
    where: ownedSiteSessionWhere({
      siteId,
      organizationId,
      userId: raw.userId,
    }),
    select: { slug: true },
  });
  if (!site) return null;
  return {
    id: raw.id,
    token: raw.token,
    userId: raw.userId,
    purpose: raw.purpose,
    organizationId,
    siteId,
    siteSlug: site.slug,
    expiresAt,
  };
}

type SessionRevocationStore = {
  session: {
    deleteMany: (input: {
      where: { id: string; token: string; userId: string };
    }) => Promise<{ count: number }>;
  };
  authEvent: {
    create: (input: Prisma.AuthEventCreateArgs) => PromiseLike<unknown>;
  };
};

export async function persistSessionRevocation(
  session: CurrentSession,
  store: SessionRevocationStore,
): Promise<void> {
  const deleted = await store.session.deleteMany({
    where: {
      id: session.id,
      token: session.token,
      userId: session.userId,
    },
  });
  if (deleted.count !== 1) {
    throw new Error("The current session was already changed");
  }
  await store.authEvent.create({
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

export async function revokeCurrentSessionAtomically(
  session: CurrentSession,
  database: Pick<PrismaClient, "$transaction"> = getDb(),
): Promise<void> {
  await database.$transaction(async (transaction) => {
    await persistSessionRevocation(session, transaction);
  });
}
