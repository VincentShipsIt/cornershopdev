import { Vertical } from "@/generated/prisma/enums";
import {
  sampleRestaurant,
  toRestaurantDraft,
  type RestaurantDraft,
  type RestaurantSiteDraft,
} from "@/lib/restaurant";
import { findSiteView } from "@/lib/sites";

/**
 * Flat restaurant-shaped view over the generic site read path. The renderer and the
 * preview/claim pages are vertical-agnostic now; this remains for the dashboard and
 * the marketing surfaces, which still edit the legacy flat `RestaurantDraft`.
 */
export async function getRestaurantDraft(
  slug: string,
): Promise<RestaurantDraft> {
  return (
    (await findRestaurantDraft(slug)) ?? {
      ...sampleRestaurant,
      slug,
    }
  );
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
