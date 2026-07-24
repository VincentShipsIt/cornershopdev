import type { RestaurantTemplate } from "@/lib/restaurant-templates";
import { restaurantDictionaryExtensions as dictionaries } from "@/lib/verticals/restaurant/config";

export type SupportedUiLocale = "en" | "fr";

export function getRestaurantDictionary(locale: string) {
  return dictionaries[toUiLocale(locale)];
}

export function getRestaurantTemplateCopy(
  template: RestaurantTemplate,
  locale: string,
) {
  return template.copy[toUiLocale(locale)];
}

export function localizeIntegrationUrl(url: string, locale: string): string {
  try {
    const localizedUrl = new URL(url);
    if (!localizedUrl.searchParams.has("lang")) return url;
    localizedUrl.searchParams.set("lang", locale.split("-")[0].toLowerCase());
    return localizedUrl.toString();
  } catch {
    return url;
  }
}

function toUiLocale(locale: string): SupportedUiLocale {
  return locale.toLowerCase().startsWith("fr") ? "fr" : "en";
}
