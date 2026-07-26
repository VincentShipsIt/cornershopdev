import "server-only";
import { getCurrentSession } from "@/lib/current-session";
import { getDb } from "@/lib/db";
import { isConfiguredSuperadminEmail } from "@/lib/superadmin-config";
import type { VerticalId } from "@/lib/verticals/types";

export type AccessFailure = {
  ok: false;
  status: 401 | 403 | 503;
  message: string;
};

export type SiteAccess = {
  ok: true;
  session: {
    userId: string;
    siteSlug: string;
  };
  site: {
    id: string;
    slug: string;
    vertical: VerticalId;
    organizationId: string;
  };
  user: {
    id: string;
    email: string;
  };
};

export type SuperadminAccess = {
  id: string;
  email: string;
};

/**
 * Revalidates the signed session against current organization membership.
 * Removing a user from an organization therefore revokes access immediately,
 * even if their browser still holds an unexpired cookie.
 */
export async function getSiteAccess(
  siteSlug: string,
): Promise<SiteAccess | AccessFailure> {
  const session = await getCurrentSession();
  if (!session) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }
  if (!session.siteSlug || session.siteSlug !== siteSlug) {
    return { ok: false, status: 403, message: "Forbidden" };
  }
  if (!process.env.DATABASE_URL) {
    return {
      ok: false,
      status: 503,
      message: "Account database is not configured",
    };
  }

  const site = await getDb().site.findFirst({
    where: {
      slug: siteSlug,
      organization: {
        memberships: { some: { userId: session.userId } },
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
            where: { userId: session.userId },
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
  if (!site?.organizationId || !user) {
    return { ok: false, status: 403, message: "Forbidden" };
  }

  return {
    ok: true,
    session: { userId: session.userId, siteSlug },
    site: {
      id: site.id,
      slug: site.slug,
      vertical: site.vertical,
      organizationId: site.organizationId,
    },
    user,
  };
}

/**
 * Platform access requires both a database role and deployment configuration.
 * A stale database promotion or an accidental environment entry is insufficient
 * on its own.
 */
export async function getSuperadminAccess(): Promise<SuperadminAccess | null> {
  const session = await getCurrentSession();
  if (!session || !process.env.DATABASE_URL) return null;

  const user = await getDb().user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, platformRole: true },
  });
  if (
    !user ||
    user.platformRole !== "SUPERADMIN" ||
    !isConfiguredSuperadminEmail(user.email)
  ) {
    return null;
  }
  return { id: user.id, email: user.email };
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
