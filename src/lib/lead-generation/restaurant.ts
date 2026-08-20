import { Vertical } from "@/generated/prisma/enums";
import type { LeadDiscoveryAdapter } from "@/lib/lead-generation/types";

export const restaurantLeadDiscovery = {
  vertical: Vertical.RESTAURANT,
  adapterId: "restaurant-local-v1",
  placeSearch: {
    googleQuery: (city) => `restaurants in ${city}`,
    googleIncludedType: "restaurant",
    nominatimQuery: (city) => `restaurant in ${city}`,
    fallbackCategory: "restaurant",
  },
  eligibility: {
    categoryPattern:
      /(?:^|_)(?:restaurant|cafe|cafeteria|bistro|brasserie|food_establishment)(?:_|$)/i,
    categoryLabel: "restaurant or dining venue",
  },
  homepage: {
    catalogPattern:
      /(?:href=["'][^"']*(?:\/menu\b|\/menus\b|\/carte\b|\/speise|\/carta\b)[^"']*["']|\b(?:menu|menus|la carte|carte|speisekarte)\b)/i,
    conversionPattern:
      /\b(?:book(?:ing)?|reserve|reservation|opentable|sevenrooms|resy|thefork|lafourchette|quandoo|zenchef|bookatable)\b/i,
    structuredDataTypes: /^(Restaurant|FoodEstablishment|LocalBusiness)$/i,
    catalogLabel: "menu or carte",
    conversionLabel: "booking or reservation",
    structuredDataLabel: "Restaurant or LocalBusiness",
  },
  audit: {
    categoryExample: "restaurant or the actual cuisine",
    audienceNoun: "diners",
    photoSubjects: "interior, exterior, and plate",
  },
} satisfies LeadDiscoveryAdapter;
