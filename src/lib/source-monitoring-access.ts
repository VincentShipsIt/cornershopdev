import "server-only";
import {
  getSiteAccess,
  getSuperadminAccess,
  type AccessFailure,
} from "@/lib/authorization";
import { getDb } from "@/lib/db";

export type SourceMonitoringAccess =
  | {
      ok: true;
      site: { id: string; slug: string };
      actor: {
        id: string;
        email: string;
        role: "owner" | "operator";
      };
    }
  | AccessFailure;

export async function getSourceMonitoringAccess(
  siteSlug: string,
): Promise<SourceMonitoringAccess> {
  const owner = await getSiteAccess(siteSlug);
  if (owner.ok) {
    return {
      ok: true,
      site: { id: owner.site.id, slug: owner.site.slug },
      actor: {
        id: owner.user.id,
        email: owner.user.email,
        role: "owner",
      },
    };
  }

  const operator = await getSuperadminAccess();
  if (!operator) return owner;
  const site = await getDb().site.findUnique({
    where: { slug: siteSlug },
    select: { id: true, slug: true },
  });
  if (!site) {
    return {
      ok: false,
      status: 403,
      message: "Site access is required",
    };
  }
  return {
    ok: true,
    site,
    actor: {
      id: operator.id,
      email: operator.email,
      role: "operator",
    },
  };
}
