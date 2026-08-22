import type { SiteIntegrationView } from "@/lib/site-draft";

export const CORNERSHOP_PRO_BRAND = "Cornershop Pro";

/**
 * Studio clients sold 1:1 through Corner Shop Labs. Listed here only — never on
 * the factory homepage. Each slug maps to the same site row as `/preview/[slug]`
 * but is served under `/pro/[slug]` for Cornershop Pro engagements.
 */
export const CORNERSHOP_PRO_CLIENT_SLUGS = ["servizo"] as const;

export type CornershopProClientSlug =
  (typeof CORNERSHOP_PRO_CLIENT_SLUGS)[number];

export function isCornershopProClient(
  slug: string,
): slug is CornershopProClientSlug {
  return (CORNERSHOP_PRO_CLIENT_SLUGS as readonly string[]).includes(slug);
}

export function proSiteBasePath(slug: string): string {
  return `/pro/${encodeURIComponent(slug)}`;
}

export function proAppPath(slug: string): string {
  return `${proSiteBasePath(slug)}/app`;
}

/** Preview path for owner dashboards — Pro clients use `/pro`, everyone else `/preview`. */
export function ownerPreviewHref(slug: string): string {
  return isCornershopProClient(slug)
    ? proSiteBasePath(slug)
    : `/preview/${encodeURIComponent(slug)}`;
}

/**
 * Linked owner product (e.g. Servizo Pulse). Seeded as a generic `ordering`
 * integration with no provider — distinct from restaurant marketplaces.
 */
export function resolveProOwnerAppUrl(
  integrations: SiteIntegrationView[],
): string | null {
  const candidate = integrations.find(
    (integration) =>
      integration.enabled !== false &&
      integration.type === "ordering" &&
      !integration.provider &&
      integration.url.trim(),
  );
  return candidate?.url ?? null;
}
