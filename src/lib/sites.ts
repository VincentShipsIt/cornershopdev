import { getDb } from "@/lib/db";
import { getVerticalConfig } from "@/lib/verticals/registry";
import type { VerticalId } from "@/lib/verticals/types";

export type LoadedSite = {
  vertical: VerticalId;
  config: ReturnType<typeof getVerticalConfig>;
  draft: unknown;
};

/**
 * The vertical-agnostic read path: load a `Site` row and project it back through
 * the owning vertical's own schemas. Nothing here knows what a menu, a cuisine or
 * a dietary label is — those live in the `attributes` bags and are re-validated on
 * the way out, so a bad write surfaces here rather than in the renderer.
 *
 * Returns `null` when the database is not configured or the slug is unknown; the
 * in-code fixture fallbacks are a caller concern, not a storage concern.
 */
export async function findSiteDraft(slug: string): Promise<LoadedSite | null> {
  if (!process.env.DATABASE_URL) return null;

  const site = await getDb().site.findUnique({
    where: { slug },
    include: {
      integrations: { orderBy: { createdAt: "asc" } },
      catalogSections: {
        orderBy: { position: "asc" },
        include: { items: { orderBy: { position: "asc" } } },
      },
      siteVersions: { orderBy: { version: "desc" }, take: 1 },
    },
  });

  if (!site) return null;

  const config = getVerticalConfig(site.vertical);
  const attributes = config.attributesSchema.parse(site.attributes);
  const latestTheme = site.siteVersions[0]?.theme as
    | { background: string; foreground: string; accent: string }
    | undefined;

  const draft = config.draftSchema.parse({
    slug: site.slug,
    name: site.name,
    eyebrow: config.presentation.buildEyebrow(attributes, {
      address: site.address,
    }),
    description: site.description ?? config.presentation.fallbackDescription,
    address: site.address ?? "",
    phone: site.phone ?? "",
    sourceUrl: site.sourceUrl,
    heroImageUrl: site.heroImageUrl,
    heroOriginalImageUrl: site.heroOriginalImageUrl,
    heroImageProvenance: fromDatabaseImageProvenance(site.heroImageProvenance),
    palette: latestTheme ?? config.presentation.fallbackPalette,
    attributes,
    autoEnhanceImages: site.autoEnhanceImages,
    defaultLocale: site.defaultLocale,
    translations: site.translations,
    catalogSections: site.catalogSections.map((section) => ({
      name: section.name,
      description: section.description ?? "",
      items: section.items.map((item) => ({
        name: item.name,
        description: item.description ?? "",
        price: item.price === null ? null : Number(item.price),
        currency: item.currency,
        attributes: config.itemAttributesSchema.parse(item.attributes),
        imageUrl: item.imageUrl,
        originalImageUrl: item.originalImageUrl,
        imageProvenance: fromDatabaseImageProvenance(item.imageProvenance),
      })),
    })),
    integrations: site.integrations.map((integration) => ({
      type: integration.type.toLowerCase(),
      label: integration.label,
      provider: integration.provider,
      url: integration.url,
    })),
  });

  return { vertical: site.vertical, config, draft };
}

function fromDatabaseImageProvenance(
  value: "OFFICIAL" | "OWNER" | "PERMISSIONED_UGC" | null,
): "official" | "owner" | "permissioned-ugc" | null {
  if (!value) return null;
  return value.toLowerCase().replace("_", "-") as
    | "official"
    | "owner"
    | "permissioned-ugc";
}
