import { Vertical } from "@/generated/prisma/enums";
import { getDb } from "@/lib/db";
import { normalizeImportSource } from "@/lib/import-identity";
import { leadSiteDrafts } from "@/lib/lead-drafts";
import {
  createOperatorSiteImport,
  OperatorImportConflictError,
} from "@/lib/site-persistence";

const canonicalSlug = "le-petit-meunier";
const legacySlug = "restaurant-le-petit-meunier";
const draft = leadSiteDrafts[canonicalSlug];

async function main() {
  const execute = parseMode(process.argv.slice(2));
  const source = draft.sourceUrl;
  if (!source) throw new Error("The approved fixture has no source URL");
  const sourceKey = normalizeImportSource(source);
  const expectedItemCount = draft.catalogSections.reduce(
    (sum, section) => sum + section.items.length,
    0,
  );
  const plan = {
    mode: execute ? "execute" : "dry-run",
    slug: canonicalSlug,
    source,
    sourceKey,
    vertical: Vertical.RESTAURANT,
    status: "PREVIEW_READY",
    sections: draft.catalogSections.length,
    items: expectedItemCount,
    integrations: draft.integrations.length,
    translations: draft.translations.length,
    forbiddenSlugs: [canonicalSlug, legacySlug],
  };

  const db = getDb();
  try {
    const conflict = await db.site.findFirst({
      where: {
        OR: [
          { slug: { in: [canonicalSlug, legacySlug] } },
          { sourceKey },
          { sourceUrl: source },
        ],
      },
      select: { slug: true, sourceKey: true, status: true },
    });
    if (conflict) {
      throw new OperatorImportConflictError();
    }

    if (!execute) {
      console.log(JSON.stringify({ ...plan, preflight: "clear" }, null, 2));
      return;
    }

    const imported = await createOperatorSiteImport({
      draft,
      vertical: Vertical.RESTAURANT,
      source,
      forbiddenSlugs: [legacySlug],
    });
    const verified = await db.site.findUnique({
      where: { slug: canonicalSlug },
      select: {
        slug: true,
        eyebrow: true,
        status: true,
        sourceKey: true,
        _count: {
          select: {
            catalogSections: true,
            integrations: true,
            siteVersions: true,
          },
        },
        catalogSections: {
          select: { _count: { select: { items: true } } },
        },
      },
    });
    if (!verified) throw new Error("Imported site could not be read back");
    const verifiedItemCount = verified.catalogSections.reduce(
      (sum, section) => sum + section._count.items,
      0,
    );
    if (
      verified.slug !== canonicalSlug ||
      verified.eyebrow !== draft.eyebrow ||
      verified.status !== "PREVIEW_READY" ||
      verified.sourceKey !== sourceKey ||
      verified._count.catalogSections !== draft.catalogSections.length ||
      verifiedItemCount !== expectedItemCount ||
      verified._count.integrations !== draft.integrations.length ||
      verified._count.siteVersions !== 1
    ) {
      throw new Error("Imported site failed its database verification");
    }

    console.log(
      JSON.stringify(
        {
          ...plan,
          preflight: "clear",
          importJobId: imported.importJobId,
          verified: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await db.$disconnect();
  }
}

function parseMode(args: string[]): boolean {
  if (args.length === 0) return false;
  if (args.length === 1 && args[0] === "--execute") return true;
  throw new Error("Usage: bun run operator:import:le-petit-meunier [--execute]");
}

await main();
