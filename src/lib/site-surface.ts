export const LIVE_SITE_SLUG_HEADER = "x-cornershop-live-site-slug";
export const LIVE_SITE_VERSION_HEADER = "x-cornershop-live-site-version";
export const PUBLIC_SITE_VERSION_HEADER = "x-cornershop-site-version";

export function liveSiteVersionId(
  headers: Pick<Headers, "get">,
  siteSlug: string,
): string | null {
  if (headers.get(LIVE_SITE_SLUG_HEADER) !== siteSlug) return null;
  const versionId = headers.get(LIVE_SITE_VERSION_HEADER)?.trim();
  return versionId || null;
}

export function isLiveSiteSurface(
  headers: Pick<Headers, "get">,
  siteSlug: string,
): boolean {
  return liveSiteVersionId(headers, siteSlug) !== null;
}

export function localeHref(
  basePath: string,
  locale: string,
  defaultLocale: string,
): string {
  if (locale === defaultLocale) return basePath;
  return `${basePath.replace(/\/$/, "")}/${locale}`;
}

export function liveSiteCanonicalPath(
  origin: string,
  locale: string,
  defaultLocale: string,
): string {
  return locale === defaultLocale ? `${origin}/` : `${origin}/${locale}`;
}

/**
 * The `unstable_cache` tag for a site's cached live-surface data.
 *
 * One tag per slug, not per version: a rollback or republish moves which
 * version is current for the slug, so invalidation must key on the slug
 * regardless of which immutable `SiteVersion` row is being served.
 */
export function previewCacheTagFor(slug: string): string {
  return `preview-site:${slug}`;
}
