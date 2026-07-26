import "server-only";
import {
  createAuthorizationPolicy,
  type AccessFailure,
  type SiteAccess,
  type SiteAccessRecord,
  type SuperadminAccess,
} from "@/lib/authorization-policy";
import { getCurrentSession } from "@/lib/current-session";
import { getDb } from "@/lib/db";
import { isConfiguredSuperadminEmail } from "@/lib/superadmin-config";

const authorization = createAuthorizationPolicy({
  isDatabaseConfigured: () => Boolean(process.env.DATABASE_URL),
  getSession: getCurrentSession,
  findSiteForMember: async (siteSlug, userId) => {
    const site = await getDb().site.findFirst({
      where: {
        slug: siteSlug,
        organization: {
          memberships: { some: { userId } },
        },
      },
      select: {
        id: true,
        slug: true,
        vertical: true,
        organizationId: true,
        organization: {
          select: {
            memberships: {
              where: { userId },
              take: 1,
              select: {
                user: { select: { id: true, email: true } },
              },
            },
          },
        },
      },
    });
    const user = site?.organization?.memberships[0]?.user;
    if (!site?.organizationId || !user) return null;

    return {
      id: site.id,
      slug: site.slug,
      vertical: site.vertical,
      organizationId: site.organizationId,
      user,
    } satisfies SiteAccessRecord;
  },
  findUser: async (userId) =>
    getDb().user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, platformRole: true },
    }),
  isSuperadminEmail: isConfiguredSuperadminEmail,
});

/**
 * Revalidates the signed session against current organization membership.
 * Removing a user from an organization therefore revokes access immediately,
 * even if their browser still holds an unexpired cookie.
 */
export function getSiteAccess(
  siteSlug: string,
): Promise<SiteAccess | AccessFailure> {
  return authorization.getSiteAccess(siteSlug);
}

/**
 * Platform access requires both a database role and deployment configuration.
 * A stale database promotion or an accidental environment entry is insufficient
 * on its own.
 */
export function getSuperadminAccess(): Promise<SuperadminAccess | null> {
  return authorization.getSuperadminAccess();
}

export function accessFailureResponse(failure: AccessFailure): Response {
  return Response.json(
    { error: failure.message },
    {
      status: failure.status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export type { AccessFailure, SiteAccess, SuperadminAccess };
