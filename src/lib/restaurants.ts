import { Vertical } from "@/generated/prisma/enums";
import { leadDrafts } from "@/lib/lead-drafts";
import {
  sampleRestaurant,
  toRestaurantDraft,
  type RestaurantDraft,
  type RestaurantSiteDraft,
} from "@/lib/restaurant";
import { findSiteDraft } from "@/lib/sites";

/**
 * Restaurant-shaped view over the generic site read path. Kept so the preview,
 * claim and dashboard pages can stay on the flat `RestaurantDraft` until they move
 * to the vertical-agnostic renderer; everything below the flattening is shared.
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
  const leadDraft = leadDrafts[slug];
  if (!process.env.DATABASE_URL) {
    if (leadDraft) return leadDraft;
    return slug === sampleRestaurant.slug ? sampleRestaurant : null;
  }

  const site = await findSiteDraft(slug);
  if (!site) return null;
  // A site in another vertical has no restaurant-shaped projection; callers that
  // can render it go through `findSiteDraft` directly.
  if (site.vertical !== Vertical.RESTAURANT) return null;

  return toRestaurantDraft(site.draft as RestaurantSiteDraft);
}
