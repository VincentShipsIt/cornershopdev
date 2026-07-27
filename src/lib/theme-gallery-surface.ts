import { FACTORY_BRAND, type BrandIdentity } from "@/lib/brand";
import { restaurantMarketing } from "@/lib/verticals/restaurant/marketing";

const FACTORY_ORIGIN = "https://cornershop.dev";
const RESTAURANT_ORIGIN = restaurantMarketing.domain
  ? `https://${restaurantMarketing.domain}`
  : null;

export type RestaurantThemeGallerySurface = {
  brand: BrandIdentity;
  canonicalOrigin: string;
  inverse: boolean;
  pricingHref: string;
};

/**
 * The restaurant theme library is reachable from both the factory and the
 * restaurant storefront. The hostname owns the outer product shell; the
 * previews inside the gallery always keep their registered restaurant themes.
 */
export function restaurantThemeGallerySurface(
  requestOrigin: string,
): RestaurantThemeGallerySurface {
  if (RESTAURANT_ORIGIN && requestOrigin === RESTAURANT_ORIGIN) {
    return {
      brand: restaurantMarketing.brand,
      canonicalOrigin: RESTAURANT_ORIGIN,
      inverse: false,
      pricingHref: "/#pricing",
    };
  }

  return {
    brand: FACTORY_BRAND,
    canonicalOrigin: FACTORY_ORIGIN,
    inverse: true,
    pricingHref: "/niche/restaurant#pricing",
  };
}
