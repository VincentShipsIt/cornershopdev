import {
  enhanceSiteImage,
  generateSiteDraft,
} from "@/lib/ai/site-generation";
import type { ExtractedSite } from "@/lib/importer";
import {
  toRestaurantDraft,
  type RestaurantDraft,
} from "@/lib/restaurant";
import { restaurantConfig } from "@/lib/verticals/restaurant/config";

export type RestaurantImageEnhancementRequest = {
  sourceImageUrl: string;
  restaurantName?: string;
  enhancementNotes?: string;
};

export async function generateRestaurantDraft(
  source: ExtractedSite,
): Promise<RestaurantDraft> {
  return toRestaurantDraft(await generateSiteDraft(source, restaurantConfig));
}

export function enhanceRestaurantImage(
  request: RestaurantImageEnhancementRequest,
) {
  return enhanceSiteImage(
    {
      sourceImageUrl: request.sourceImageUrl,
      siteName: request.restaurantName,
      enhancementNotes: request.enhancementNotes,
    },
    restaurantConfig,
  );
}
