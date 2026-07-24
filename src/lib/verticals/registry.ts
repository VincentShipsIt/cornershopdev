import { Vertical } from "@/generated/prisma/enums";
import { restaurantConfig } from "@/lib/verticals/restaurant/config";
import type { VerticalConfig, VerticalId } from "@/lib/verticals/types";

// Variance-erased on purpose: `VerticalConfig` is contravariant in TAttributes
// (templates.resolve, rendererCapabilities), so a concrete per-vertical config is
// not assignable to the abstract type. This still forces every registry entry to be
// structurally a VerticalConfig even if its own module drops its `satisfies` clause.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyVerticalConfig = VerticalConfig<any, any, any, any>;

const registry = {
  [Vertical.RESTAURANT]: restaurantConfig,
} satisfies Record<VerticalId, AnyVerticalConfig>;

// NOTE (Phase 9 gate): with RESTAURANT as the only member this returns the concrete
// restaurant config type, so callers can bind to restaurant specifics and still
// compile. Adding BEAUTY collapses this to the union and any such leak becomes a
// build error — that break is the abstraction acceptance test, not a regression.
export function getVerticalConfig(
  id: VerticalId,
): (typeof registry)[VerticalId] {
  return registry[id];
}

export function listVerticalIds(): VerticalId[] {
  return Object.keys(registry) as VerticalId[];
}
