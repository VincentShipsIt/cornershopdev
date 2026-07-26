import { describe, expect, it } from "bun:test";
import type { Prisma } from "@/generated/prisma/client";
import { leadSiteDrafts } from "@/lib/lead-drafts";
import {
  buildOperatorImportIdentity,
  findOperatorImportConflict,
} from "@/lib/site-persistence";

const canonicalSlug = "le-petit-meunier";
const legacySlug = "restaurant-le-petit-meunier";
const draft = leadSiteDrafts[canonicalSlug];
const identity = buildOperatorImportIdentity(
  draft,
  draft.sourceUrl!,
  [legacySlug],
);

describe("operator import identity", () => {
  it("derives the canonical fixture identity used by dry-run and execute", () => {
    expect(identity).toMatchObject({
      slug: canonicalSlug,
      sourceKey: "url:lepetitmeunier.com",
      sourceUrl: "https://www.lepetitmeunier.com/",
      forbiddenSlugs: [canonicalSlug, legacySlug],
    });
  });

  for (const [label, existing] of [
    ["canonical slug", { slug: canonicalSlug }],
    ["legacy slug", { slug: legacySlug }],
    ["source key", { sourceKey: "url:lepetitmeunier.com" }],
    ["source URL", { sourceUrl: "https://www.lepetitmeunier.com/" }],
  ] as const) {
    it(`detects an existing ${label}`, async () => {
      const conflict = await findOperatorImportConflict(
        {
          findFirstSite: async (where) =>
            matchesWhere(existing, where) ? { id: "site_existing" } : null,
        },
        identity,
      );

      expect(conflict).toEqual({ id: "site_existing" });
    });
  }

  it("ignores an unrelated site", async () => {
    const conflict = await findOperatorImportConflict(
      {
        findFirstSite: async (where) =>
          matchesWhere(
            {
              slug: "some-other-place",
              sourceKey: "url:example.com",
              sourceUrl: "https://example.com/",
            },
            where,
          )
            ? { id: "site_existing" }
            : null,
      },
      identity,
    );

    expect(conflict).toBeNull();
  });
});

function matchesWhere(
  row: Partial<{ slug: string; sourceKey: string; sourceUrl: string }>,
  where: Prisma.SiteWhereInput,
): boolean {
  return (where.OR ?? []).some((condition) => {
    if (
      "slug" in condition &&
      condition.slug &&
      typeof condition.slug === "object"
    ) {
      const values = condition.slug.in;
      return Array.isArray(values) && values.includes(row.slug ?? "");
    }
    if ("sourceKey" in condition && typeof condition.sourceKey === "string") {
      return condition.sourceKey === row.sourceKey;
    }
    if ("sourceUrl" in condition && typeof condition.sourceUrl === "string") {
      return condition.sourceUrl === row.sourceUrl;
    }
    return false;
  });
}
