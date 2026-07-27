import {
  listMarketingVerticals,
  listVerticalIds,
  resolveVerticalConfig,
  verticalSlug,
} from "@/lib/verticals/registry";

function factoryProduct(id: ReturnType<typeof listVerticalIds>[number]) {
  return {
    id,
    slug: verticalSlug(id),
    marketing: resolveVerticalConfig(id).marketing,
  };
}

/**
 * Launched products get full cards. The first registered-but-unlaunched niche
 * is exposed only as a teaser, never as a public product or preview.
 */
export function factoryProductCatalog() {
  const launchedIds = new Set(listMarketingVerticals());
  const nextId = listVerticalIds().find((id) => !launchedIds.has(id)) ?? null;

  return {
    launched: listMarketingVerticals().map(factoryProduct),
    next: nextId ? factoryProduct(nextId) : null,
    registeredCount: listVerticalIds().length,
  };
}
