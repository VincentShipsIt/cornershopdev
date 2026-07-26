import { Vertical } from "@/generated/prisma/enums";
import { getDb } from "@/lib/db";
import { leadSiteDrafts } from "@/lib/lead-drafts";
import type { SiteDraftView } from "@/lib/site-draft";
import { sampleSiteDraft } from "@/lib/verticals/restaurant/schema";
import {
  resolveVerticalConfig,
  type ErasedVerticalConfig,
} from "@/lib/verticals/registry";
import type { VerticalId } from "@/lib/verticals/types";

export type LoadedSite = {
  vertical: VerticalId;
  config: ErasedVerticalConfig;
  draft: unknown;
};

/**
 * What a page needs to render a site: the draft in its structural form plus the
 * vertical it belongs to, so the renderer can resolve its own config.
 */
export type SiteView = {
  vertical: VerticalId;
  draft: SiteDraftView;
};

/**
 * The vertical-agnostic read path: load a `Site` row and project it back through
 * the owning vertical's own schemas. Nothing here knows what a menu, a cuisine or
 * a dietary label is — those live in the `attributes` bags and are re-validated on
 * the way out, so a bad write surfaces here rather than in the renderer.
 *
 * Returns `null` when the database is not configured or the slug is unknown; the
 * in-code fixture fallbacks are layered on by `findSiteView` below rather than by
 * this storage read.
 */
export async function findSiteDraft(slug: string): Promise<LoadedSite | null> {
  if (!process.env.DATABASE_URL) return null;

  const site = await getDb().site.findUnique({
    where: { slug },
    include: {
      integrations: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      },
      catalogSections: {
        orderBy: { position: "asc" },
        include: { items: { orderBy: { position: "asc" } } },
      },
      siteVersions: { orderBy: { version: "desc" }, take: 1 },
    },
  });

  if (!site) return null;

  const config = resolveVerticalConfig(site.vertical);
  const attributes = config.attributesSchema.parse(site.attributes);
  const latestTheme = site.siteVersions[0]?.theme as
    | { background: string; foreground: string; accent: string }
    | undefined;

  const draft = config.draftSchema.parse({
    slug: site.slug,
    name: site.name,
    eyebrow:
      site.eyebrow ??
      config.presentation.buildEyebrow(attributes, {
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
      venueId: integration.venueId,
    })),
  });

  return { vertical: site.vertical, config, draft };
}

/**
 * The loader every rendering page uses. It adds the demo-mode fixture fallbacks on
 * top of the storage read: without `DATABASE_URL` the app still serves the seeded
 * lead drafts and the sample site, which is what makes `bun run dev` work with no
 * infrastructure. Those fixtures are restaurant drafts today — when a second
 * vertical ships fixtures they move behind the registry, not into this branch.
 */
export async function findSiteView(slug: string): Promise<SiteView | null> {
  if (!process.env.DATABASE_URL) {
    const leadDraft = leadSiteDrafts[slug];
    if (leadDraft) return { vertical: Vertical.RESTAURANT, draft: leadDraft };
    return slug === sampleSiteDraft.slug
      ? { vertical: Vertical.RESTAURANT, draft: sampleSiteDraft }
      : null;
  }

  const site = await findSiteDraft(slug);
  if (!site) return null;
  // `findSiteDraft` already parsed the draft with the vertical's own schema, and
  // every vertical draft extends the base shape the view type describes.
  return { vertical: site.vertical, draft: site.draft as SiteDraftView };
}

/**
 * Same as `findSiteView`, but falls back to the sample site under the requested
 * slug so surfaces that must always render something (the dashboard) have a draft.
 */
export async function getSiteView(slug: string): Promise<SiteView> {
  return (
    (await findSiteView(slug)) ?? {
      vertical: Vertical.RESTAURANT,
      draft: { ...sampleSiteDraft, slug },
    }
  );
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
