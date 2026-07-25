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
 * Returns the union of every registered config. With a single vertical this used
 * to hand back the concrete restaurant type, which let a caller bind to
 * restaurant specifics and still compile; registering beauty collapsed it to the
 * union and turned each of those into a build error. Prefer
 * `resolveVerticalConfig` for anything that only knows a `Vertical` at runtime —
 * this overload exists for call sites that discriminate on the union themselves.
 */
export function getVerticalConfig(
  id: VerticalId,
): (typeof registry)[VerticalId] {
  return registry[id];
}

export function resolveVerticalConfig(id: VerticalId): ErasedVerticalConfig {
  return registry[id];
}

export function listVerticalIds(): VerticalId[] {
  return Object.keys(registry) as VerticalId[];
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
