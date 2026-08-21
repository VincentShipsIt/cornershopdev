import "server-only";
import type { Vertical } from "@/generated/prisma/enums";
import { getDb } from "@/lib/db";
import { ownerMembershipWhere } from "@/lib/owner-membership";

export type AccountWorkspace = {
  id: string;
  slug: string;
  name: string;
  vertical: Vertical;
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
