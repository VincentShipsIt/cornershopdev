import { Vertical } from "@/generated/prisma/enums";
import type { LeadDiscoveryAdapter } from "@/lib/lead-generation/types";

export const beautyLeadDiscovery = {
  vertical: Vertical.BEAUTY,
  adapterId: "beauty-local-v1",
  placeSearch: {
    googleQuery: (city) => `beauty businesses in ${city}`,
    googleQueries: (city) =>
      [
        "beauty salons",
        "hair salons",
        "barber shops",
        "nail salons",
        "spas",
      ].map((subtype) => ({
        query: `${subtype} in ${city}`,
        includedType: null,
      })),
    googleIncludedType: null,
    nominatimQuery: (city) => `beauty businesses in ${city}`,
    nominatimQueries: (city) => [
      { query: `beauty salon in ${city}`, fallbackCategory: "beauty_salon" },
      { query: `hair salon in ${city}`, fallbackCategory: "hair_salon" },
      { query: `barber shop in ${city}`, fallbackCategory: "barber" },
      { query: `nail salon in ${city}`, fallbackCategory: "nail_salon" },
      { query: `spa in ${city}`, fallbackCategory: "spa" },
    ],
    fallbackCategory: "beauty_salon",
  },
  eligibility: {
    categoryPattern:
      /(?:^|_)(?:beauty_salon|hair_salon|hair_care|barber|nail_salon|spa)(?:_|$)/i,
    categoryLabel: "beauty, hair, barber, nail, or spa business",
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
