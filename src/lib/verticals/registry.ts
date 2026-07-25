import { Vertical } from "@/generated/prisma/enums";
import { beautyConfig } from "@/lib/verticals/beauty/config";
import { restaurantConfig } from "@/lib/verticals/restaurant/config";
import type { VerticalConfig, VerticalId } from "@/lib/verticals/types";

/**
 * Variance-erased on purpose: `VerticalConfig` is contravariant in TAttributes —
 * `templates.resolve`, `normalizeGeneratedAttributes`, `rendererCapabilities` and
 * `presentation.buildEyebrow` all *consume* them — so a concrete per-vertical
 * config is not assignable to the abstract type, and the union that appears once a
 * second vertical registers is not callable. Every caller that only knows a
 * `Vertical` value at runtime (the import route, the workflow, the renderer) goes
 * through `resolveVerticalConfig` and gets this erased surface, which keeps the
 * erasure in one documented place instead of at each call site.
 *
 * It still forces every registry entry to be structurally a `VerticalConfig` even
 * if its own module drops its `satisfies` clause.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ErasedVerticalConfig = VerticalConfig<any, any, any, any>;

const registry = {
  [Vertical.RESTAURANT]: restaurantConfig,
  [Vertical.BEAUTY]: beautyConfig,
} satisfies Record<VerticalId, ErasedVerticalConfig>;

/**
 * The only way to get a config from a runtime `Vertical` value. It deliberately
 * returns the erased surface rather than the union of registered configs: while
 * restaurant was the sole vertical, a union-typed lookup handed back the concrete
 * restaurant type, so a caller could bind to restaurant specifics and still
 * compile. Registering beauty collapsed that to a union and turned every such
 * binding into a build error at once. Erasing here means a call site can only ever
 * use the shared contract, so vertical #3 costs nothing. Anything that genuinely
 * needs a vertical's specifics imports that vertical's config module directly.
 */
export function resolveVerticalConfig(id: VerticalId): ErasedVerticalConfig {
  return registry[id];
}

export function listVerticalIds(): VerticalId[] {
  return Object.keys(registry) as VerticalId[];
}

/**
 * The niche's URL segment and the value carried on a lead: the enum member
 * lowercased, so `RESTAURANT` is `restaurant`. Derived rather than declared —
 * a config cannot drift from its own slug, and a new vertical gets one for free.
 */
export function verticalSlug(id: VerticalId): string {
  return id.toLowerCase();
}

/**
 * The inverse, for a slug that arrived from a URL or a form field and is
 * therefore untrusted. Returns null rather than throwing so callers decide
 * between a 404 and a silent fall back to the default vertical.
 */
export function resolveVerticalBySlug(slug: string): VerticalId | null {
  const wanted = slug.trim().toLowerCase();
  return listVerticalIds().find((id) => verticalSlug(id) === wanted) ?? null;
}

/**
 * Which niche, if any, owns a request's hostname. This is what makes a new niche
 * domain — nails, barbers, dog grooming — a config entry and a DNS record rather
 * than a new route: `proxy.ts` asks this question and rewrites to the shared
 * niche page. Derived from the registry for the same reason as
 * `listEmbedFrameOrigins`: there is no second list of domains to keep in sync,
 * and a hostname nobody registered can never be served as a niche.
 *
 * The port is stripped so `nails.localhost:3000` matches in development.
 */
export function resolveVerticalByHostname(hostname: string): VerticalId | null {
  const wanted = hostname.trim().toLowerCase().split(":")[0];
  if (!wanted) return null;
  for (const id of listVerticalIds()) {
    // Through the erased surface, not `registry[id]`: indexing with a runtime id
    // yields the union of the concrete configs, and `includes` on a union of array
    // types demands an argument assignable to every element type at once — which
    // is `never` the moment one vertical registers no hostnames.
    if (resolveVerticalConfig(id).marketing.hostnames.includes(wanted)) return id;
  }
  return null;
}

/**
 * Every registered niche, launched or not, for the factory homepage. Ones with a
 * live domain come first — the homepage sells what it can already deliver — and
 * ties break on the niche's own brand name so the order never depends on
 * registration order.
 */
export function listMarketingVerticals(): VerticalId[] {
  return listVerticalIds().sort((a, b) => {
    const left = resolveVerticalConfig(a).marketing;
    const right = resolveVerticalConfig(b).marketing;
    if (Boolean(left.domain) !== Boolean(right.domain)) {
      return left.domain ? -1 : 1;
    }
    return left.brand.name.localeCompare(right.brand.name);
  });
}

/**
 * Every origin any registered vertical may frame a booking widget from, derived
 * from the provider tables themselves. The site CSP is built from this, so a
 * vertical that adds a widget provider extends the allow-list by registering —
 * there is no second list to keep in sync, and nothing outside a provider table
 * can ever be framed.
 */
export function listEmbedFrameOrigins(): string[] {
  const origins = new Set<string>();
  for (const config of Object.values(registry) as ErasedVerticalConfig[]) {
    for (const provider of config.providers) {
      if (provider.embed) origins.add(provider.embed.origin);
    }
  }
  return [...origins].sort();
}
