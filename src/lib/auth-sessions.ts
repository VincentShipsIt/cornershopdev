import "server-only";
import { auth } from "@/lib/better-auth";
import {
  isSessionPurpose,
  type SessionPurpose,
} from "@/lib/auth-session-binding";
import { getDb } from "@/lib/db";
import { ownedSiteSessionWhere } from "@/lib/owner-membership";

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
    userId: raw.userId,
    purpose: raw.purpose,
    organizationId,
    siteId,
    siteSlug: site.slug,
    expiresAt,
  };
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
