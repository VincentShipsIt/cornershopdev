import { Vertical } from "@/generated/prisma/enums";
import type { LeadDiscoveryAdapter } from "@/lib/lead-generation/types";

export const beautyLeadDiscovery = {
  vertical: Vertical.BEAUTY,
  adapterId: "beauty-local-v1",
  placeSearch: {
    googleQuery: (city) => `beauty salons and barbers in ${city}`,
    googleIncludedType: "beauty_salon",
    nominatimQuery: (city) => `beauty salon in ${city}`,
    fallbackCategory: "beauty_salon",
  },
  homepage: {
    catalogPattern:
      /(?:href=["'][^"']*(?:\/services?\b|\/treatments?\b|\/prices?\b|\/price-list\b)[^"']*["']|\b(?:services|treatments|price list|haircuts|colouring|coloring|manicure|facial)\b)/i,
    conversionPattern:
      /\b(?:book(?:ing)?|appointment|booksy|fresha|treatwell|planity|vagaro|mindbody)\b/i,
    structuredDataTypes:
      /^(BeautySalon|HairSalon|NailSalon|HealthAndBeautyBusiness|LocalBusiness)$/i,
    catalogLabel: "service or treatment list",
    conversionLabel: "appointment booking",
    structuredDataLabel: "BeautySalon or LocalBusiness",
  },
  audit: {
    categoryExample: "beauty salon, hair salon, barber shop, or nail salon",
    audienceNoun: "clients",
    photoSubjects: "interior, team, and approved treatment",
  },
} satisfies LeadDiscoveryAdapter;
