import { Vertical } from "@/generated/prisma/enums";
import type { SiteThemeView } from "@/lib/site-draft";
import {
  parseRestaurantThemeSelection,
} from "@/lib/site-themes/restaurant/selection";
import type { VerticalId } from "@/lib/verticals/types";

export function restaurantRendererVersionId(rendererVersion: number): string {
  return `restaurant-renderer-v${rendererVersion}`;
}

/**
 * Resolves the registered restaurant renderer stored in the vertical
 * attributes bag. Returning null is intentional: legacy restaurants must keep
 * their established cuisine-era renderer until an owner or a new import opts
 * them into the versioned registry.
 */
export function restaurantSiteTheme(
  vertical: VerticalId,
  attributes: Record<string, unknown>,
): SiteThemeView | null {
  if (vertical !== Vertical.RESTAURANT) return null;
  const selection = parseRestaurantThemeSelection(attributes.themeSelection);
  if (!selection) return null;

  return {
    id: selection.themeId,
    version: restaurantRendererVersionId(selection.rendererVersion),
    selection,
  };
}
