import { Vertical } from "@/generated/prisma/enums";
import {
  toRestaurantDraft,
  type RestaurantDraft,
  type RestaurantSiteDraft,
} from "@/lib/restaurant";
import { findSiteView } from "@/lib/sites";

/**
 * Flat restaurant-shaped view over the generic site read path. The renderer and the
 * preview/claim pages are vertical-agnostic now; this remains for the dashboard and
 * the marketing surfaces, which still edit the legacy flat `RestaurantDraft`.
 *
 * Never invents a sample restaurant under an arbitrary slug. Callers that need a
 * demo fixture must use `sampleRestaurant` from `@/lib/restaurant` explicitly so a
 * beauty (or missing) site cannot be shown or saved as Osteria Luna.
 */
export async function getRestaurantDraft(
  slug: string,
): Promise<RestaurantDraft | null> {
  return findRestaurantDraft(slug);
}

export async function findRestaurantDraft(
  slug: string,
): Promise<RestaurantDraft | null> {
  const site = await findSiteView(slug);
  if (!site) return null;
  // A site in another vertical has no restaurant-shaped projection; callers that
  // can render it go through `findSiteView` directly.
  if (site.vertical !== Vertical.RESTAURANT) return null;

  return toRestaurantDraft(site.draft as RestaurantSiteDraft);
}
