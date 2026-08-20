import "server-only";
import { getDb } from "@/lib/db";
import { ownerMembershipWhere } from "@/lib/owner-membership";

export type AccountWorkspace = {
  id: string;
  slug: string;
  name: string;
  vertical: "RESTAURANT" | "BEAUTY";
};

export function listAccountWorkspaces(userId: string): Promise<AccountWorkspace[]> {
  return getDb().site.findMany({
    where: {
      organization: { memberships: { some: ownerMembershipWhere(userId) } },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, slug: true, name: true, vertical: true },
  });
}
