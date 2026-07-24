import { restaurantConfig } from "@/lib/verticals/restaurant/config";
import type { RestaurantTemplate } from "@/lib/verticals/restaurant/templates";

export {
  type RestaurantTemplate,
  type RestaurantTemplateId,
} from "@/lib/verticals/restaurant/templates";

export function resolveRestaurantTemplate(
  cuisine: string,
): RestaurantTemplate {
  return restaurantConfig.templates.resolve({
    cuisine,
    showMenuImages: false,
  });
}

export function shouldShowMenuImagesByDefault(cuisine: string): boolean {
  return resolveRestaurantTemplate(cuisine).showMenuImagesByDefault;
}
