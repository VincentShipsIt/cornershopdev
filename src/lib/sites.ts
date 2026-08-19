import { unstable_cache } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { Vertical } from "@/generated/prisma/enums";
import { getDb } from "@/lib/db";
import { leadSiteDrafts } from "@/lib/lead-drafts";
import type {
  SiteDraftView,
  SitePaletteView,
  SiteThemeView,
} from "@/lib/site-draft";
import { LEGACY_THEME_VERSION } from "@/lib/site-draft";
import { previewCacheTagFor } from "@/lib/site-surface";
import {
  restaurantRendererVersionId,
  restaurantSiteTheme,
} from "@/lib/site-themes/restaurant/configuration";
import { parseRestaurantThemeSelection } from "@/lib/site-themes/restaurant/selection";
import { sampleSiteDraft } from "@/lib/verticals/restaurant/schema";
import {
  resolveVerticalConfig,
  type ErasedVerticalConfig,
} from "@/lib/verticals/registry";
import type { VerticalId } from "@/lib/verticals/types";

/**
 * How long a customer domain's live-surface fetch may serve a cached
 * `SiteVersion` before revalidating from the database on its own. Publish,
 * rollback, and domain-verification changes invalidate this early via
 * `revalidateTag(previewCacheTagFor(slug), ...)`, so this window only bounds
 * staleness for state changes those call sites don't cover directly.
 */
const PUBLISHED_SITE_VIEW_REVALIDATE_SECONDS = 300;

export const siteDraftRelations = {
  integrations: {
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  },
  catalogSections: {
    orderBy: { position: "asc" },
    include: { items: { orderBy: { position: "asc" } } },
  },
} satisfies Prisma.SiteInclude;

export type PersistedSiteDraftRecord = Prisma.SiteGetPayload<{
  include: typeof siteDraftRelations;
}>;

export type LoadedSite = {
  vertical: VerticalId;
  config: ErasedVerticalConfig;
  draft: unknown;
  theme: SiteThemeView;
};

/**
 * What a page needs to render a site: the draft in its structural form plus the
 * vertical and pinned theme identity that own it.
 */
export type SiteView = {
  vertical: VerticalId;
  draft: SiteDraftView;
  theme: SiteThemeView;
};

export type PublishedSiteVersionRecord = {
  vertical: VerticalId;
  theme: Prisma.JsonValue;
  themeVersion: string;
  palette: Prisma.JsonValue;
  content: Prisma.JsonValue;
  translations: Prisma.JsonValue;
  integrations: Prisma.JsonValue;
  publishedAt: Date | null;
};

/**
 * Projects editable Site rows through the owning vertical's schemas.
 *
 * This function is shared with the publish transaction so the private preview
 * and the snapshot being published cannot drift into separate serialization
 * formats.
 */
export function projectSiteDraft(site: PersistedSiteDraftRecord): LoadedSite {
  const config = resolveVerticalConfig(site.vertical);
  const attributes = config.attributesSchema.parse(site.attributes);
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
    heroImageProvenance: fromDatabaseImageProvenance(
      site.heroImageProvenance,
    ),
    palette: storedPalette(
      site.draftPalette,
      config.presentation.fallbackPalette,
    ),
    attributes,
    autoEnhanceImages: site.autoEnhanceImages,
    defaultLocale: site.defaultLocale,
    businessHours: site.businessHours,
    translations: site.translations,
    catalogSections: site.catalogSections.map((section) => ({
      name: section.name,
      description: section.description ?? "",
      items: section.items.map((item) => ({
        name: item.name,
        description: item.description ?? "",
        price: item.price === null ? null : Number(item.price),
        currency: item.currency,
        available: item.available,
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
      enabled: integration.enabled,
      venueId: integration.venueId,
    })),
  });

  return {
    vertical: site.vertical,
    config,
    draft,
    theme: editableTheme(
      site.vertical,
      config,
      attributes,
      site.draftTheme,
      site.draftThemeVersion,
    ),
  };
}

/**
 * Loads only editable draft state. Private previews and owner dashboards use
 * this path; custom domains never do.
 */
export async function findSiteDraft(slug: string): Promise<LoadedSite | null> {
  if (!process.env.DATABASE_URL) return null;

  const site = await getDb().site.findUnique({
    where: { slug },
    include: siteDraftRelations,
  });

  return site ? projectSiteDraft(site) : null;
}

/**
 * Dereferences the site's one live pointer and validates the immutable snapshot
 * before rendering it. Mutable Site columns and child rows are intentionally not
 * selected, so a Save cannot leak into a public custom domain.
 */
export async function findPublishedSiteView(
  slug: string,
  versionId?: string,
): Promise<SiteView | null> {
  if (!process.env.DATABASE_URL) return null;

  const version = versionId
    ? await getDb().siteVersion.findFirst({
        where: {
          id: versionId,
          publishedAt: { not: null },
          site: {
            slug,
            status: "LIVE",
            publishedSiteVersionId: versionId,
          },
        },
        select: {
          vertical: true,
          theme: true,
          themeVersion: true,
          palette: true,
          content: true,
          translations: true,
          integrations: true,
          publishedAt: true,
        },
      })
    : (
        await getDb().site.findUnique({
          where: { slug },
          select: {
            publishedSiteVersion: {
              select: {
                vertical: true,
                theme: true,
                themeVersion: true,
                palette: true,
                content: true,
                translations: true,
                integrations: true,
                publishedAt: true,
              },
            },
          },
        })
      )?.publishedSiteVersion;
  return version ? projectPublishedSiteVersion(version) : null;
}

/**
 * Cached front door for the live surface a verified customer domain serves.
 *
 * `proxy.ts` only sets the version-id header for a hostname that is verified
 * and points at a `LIVE` site, so this is the ISR-equivalent path: content
 * for a given `(slug, versionId)` pair is immutable once published, and
 * `previewCacheTagFor(slug)` lets publish/rollback/domain-verification bust
 * the entry the instant the currently-serving version changes.
 *
 * `unstable_cache` is called fresh on every invocation deliberately — that is
 * what lets `tags` be computed per slug instead of being fixed once at
 * module load, which is the documented pattern for per-key tag invalidation.
 */
export function getCachedPublishedSiteView(
  slug: string,
  versionId: string,
): Promise<SiteView | null> {
  const cached = unstable_cache(
    () => findPublishedSiteView(slug, versionId),
    ["published-site-view", slug, versionId],
    {
      revalidate: PUBLISHED_SITE_VIEW_REVALIDATE_SECONDS,
      tags: [previewCacheTagFor(slug)],
    },
  );
  return cached();
}

export function projectPublishedSiteVersion(
  version: PublishedSiteVersionRecord,
): SiteView | null {
  if (!version.publishedAt) return null;
  const config = resolveVerticalConfig(version.vertical);
  const content = jsonRecord(version.content);
  const draft = config.draftSchema.parse({
    ...content,
    palette: version.palette,
    translations: version.translations,
    integrations: version.integrations,
  }) as SiteDraftView;
  const theme = publishedTheme(
    version.vertical,
    config,
    version.theme,
    version.themeVersion,
    draft.attributes,
  );
  if (!theme) return null;

  return { vertical: version.vertical, draft, theme };
}

/**
 * The loader every private rendering page uses. It adds demo fixtures on top of
 * the editable storage read; live custom-domain requests switch to
 * `findPublishedSiteView` in the page before this is called.
 */
export async function findSiteView(slug: string): Promise<SiteView | null> {
  if (!process.env.DATABASE_URL) {
    const draft =
      leadSiteDrafts[slug] ??
      (slug === sampleSiteDraft.slug ? sampleSiteDraft : null);
    if (!draft) return null;
    const config = resolveVerticalConfig(Vertical.RESTAURANT);
    const attributes = config.attributesSchema.parse(draft.attributes);
    return {
      vertical: Vertical.RESTAURANT,
      draft,
      theme: editableTheme(
        Vertical.RESTAURANT,
        config,
        attributes,
        {},
        LEGACY_THEME_VERSION,
      ),
    };
  }

  const site = await findSiteDraft(slug);
  if (!site) return null;
  return {
    vertical: site.vertical,
    draft: site.draft as SiteDraftView,
    theme: site.theme,
  };
}

/**
 * Same as `findSiteView`, but falls back to the sample site under the requested
 * slug so surfaces that must always render something (the dashboard) have a draft.
 */
export async function getSiteView(slug: string): Promise<SiteView> {
  const site = await findSiteView(slug);
  if (site) return site;

  const config = resolveVerticalConfig(Vertical.RESTAURANT);
  const draft = { ...sampleSiteDraft, slug };
  const attributes = config.attributesSchema.parse(draft.attributes);
  return {
    vertical: Vertical.RESTAURANT,
    draft,
    theme: editableTheme(
      Vertical.RESTAURANT,
      config,
      attributes,
      {},
      LEGACY_THEME_VERSION,
    ),
  };
}

function editableTheme(
  vertical: VerticalId,
  config: ErasedVerticalConfig,
  attributes: Record<string, unknown>,
  value: Prisma.JsonValue,
  version: string,
): SiteThemeView {
  const registeredTheme = restaurantSiteTheme(vertical, attributes);
  if (registeredTheme) return registeredTheme;

  const selection = jsonRecord(value);
  const storedId = typeof selection.id === "string" ? selection.id : null;
  const resolvedId = config.templates.resolve(attributes).id;
  const id =
    storedId && storedId in config.templates.definitions
      ? storedId
      : resolvedId;
  return {
    id,
    version: version || LEGACY_THEME_VERSION,
    selection: { ...selection, id },
  };
}

function publishedTheme(
  vertical: VerticalId,
  config: ErasedVerticalConfig,
  value: Prisma.JsonValue,
  version: string,
  attributes: Record<string, unknown>,
): SiteThemeView | null {
  if (vertical === Vertical.RESTAURANT) {
    const storedSelection = parseRestaurantThemeSelection(value);
    if (storedSelection) {
      const expectedVersion = restaurantRendererVersionId(
        storedSelection.rendererVersion,
      );
      if (version !== expectedVersion) return null;
      return {
        id: storedSelection.themeId,
        version,
        selection: storedSelection,
      };
    }

    // PR #64 stored the structured selection inside the immutable content
    // snapshot before the dedicated theme column was wired to the registry.
    // Read those snapshots compatibly; the next owner Save/Publish promotes the
    // same validated selection into the dedicated versioned theme fields.
    const contentTheme = restaurantSiteTheme(vertical, attributes);
    if (contentTheme) return contentTheme;
  }

  const selection = jsonRecord(value);
  const id = typeof selection.id === "string" ? selection.id : null;
  if (!id || !(id in config.templates.definitions) || !version) return null;
  return { id, version, selection };
}

function storedPalette(
  value: Prisma.JsonValue,
  fallback: SitePaletteView,
): SitePaletteView {
  const palette = jsonRecord(value);
  if (
    typeof palette.background !== "string" ||
    typeof palette.foreground !== "string" ||
    typeof palette.accent !== "string"
  ) {
    return fallback;
  }
  return {
    background: palette.background,
    foreground: palette.foreground,
    accent: palette.accent,
  };
}

function jsonRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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
