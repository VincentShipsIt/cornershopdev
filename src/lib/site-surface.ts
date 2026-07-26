export const LIVE_SITE_SLUG_HEADER = "x-cornershop-live-site-slug";

export function isLiveSiteSurface(
  headers: Pick<Headers, "get">,
  siteSlug: string,
): boolean {
  return headers.get(LIVE_SITE_SLUG_HEADER) === siteSlug;
}

export function localeHref(
  basePath: string,
  locale: string,
  defaultLocale: string,
): string {
  if (locale === defaultLocale) return basePath;
  return `${basePath.replace(/\/$/, "")}/${locale}`;
}
