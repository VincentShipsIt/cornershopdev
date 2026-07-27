export const LIVE_SITE_SLUG_HEADER = "x-cornershop-live-site-slug";
export const LIVE_SITE_VERSION_HEADER = "x-cornershop-live-site-version";

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
