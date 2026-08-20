import "server-only";
import {
  getSiteAccess,
  getSuperadminAccess,
  type AccessFailure,
} from "@/lib/authorization";
import type { Vertical } from "@/generated/prisma/enums";
import { getDb } from "@/lib/db";

export type PhotoLibraryAccess =
  | {
      ok: true;
      site: { id: string; slug: string; vertical: Vertical };
      actor: { id: string; role: "owner" | "operator" };
    }
  | AccessFailure;

export async function getPhotoLibraryAccess(
  siteSlug: string,
): Promise<PhotoLibraryAccess> {
  const owner = await getSiteAccess(siteSlug);
  if (owner.ok) {
    return {
      ok: true,
      site: {
        id: owner.site.id,
        slug: owner.site.slug,
        vertical: owner.site.vertical,
      },
      actor: { id: owner.user.id, role: "owner" },
    };
  }
  const operator = await getSuperadminAccess();
  if (!operator) return owner;
  const site = await getDb().site.findUnique({
    where: { slug: siteSlug },
    select: { id: true, slug: true, vertical: true },
  });
  if (!site) return owner;
  return {
    ok: true,
    site,
    actor: { id: operator.id, role: "operator" },
  };
}
