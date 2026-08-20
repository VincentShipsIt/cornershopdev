import "server-only";
import { getDb } from "@/lib/db";
import type { VerticalId } from "@/lib/verticals/types";

export type AccountWorkspace = {
  id: string;
  slug: string;
  name: string;
  vertical: VerticalId;
};

export function listAccountWorkspaces(userId: string): Promise<AccountWorkspace[]> {
  return getDb().site.findMany({
    where: { organization: { memberships: { some: { userId } } } },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, slug: true, name: true, vertical: true },
  });
}
