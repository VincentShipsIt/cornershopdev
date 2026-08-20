import type { LeadDiscoveryAdapter } from "@/lib/lead-generation/types";

/**
 * LOCAL_SERVICE spans several trades. It therefore relies on a bounded trade
 * query and provider category evidence instead of pretending one Google place
 * type represents plumbers, electricians, builders, repairs, and artisans.
 */
export const localServiceLeadDiscovery = {
  vertical: "LOCAL_SERVICE",
  adapterId: "local-service-local-v1",
  placeSearch: {
    googleQuery: (city) =>
      `plumbers, electricians, builders, repair services and artisans in ${city}`,
    googleIncludedType: null,
    nominatimQuery: (city) =>
      `plumber electrician builder repair artisan in ${city}`,
    fallbackCategory: "local_service",
  },
  eligibility: {
    categoryPattern:
      /(?:^|_)(?:plumber|electrician|general_contractor|builder|roofing_contractor|painter|locksmith|repair|handyman|artisan|local_service)(?:_|$)/i,
    categoryLabel:
      "plumber, electrician, builder, repair business, or artisan trade",
  },
  homepage: {
    catalogPattern:
      /(?:href=["'][^"']*(?:\/services?\b|\/what-we-do\b|\/trades?\b|\/repairs?\b|\/projects?\b)[^"']*["']|\b(?:our services|plumbing|electrical|building work|repairs|maintenance|craftsmanship)\b)/i,
    conversionPattern:
      /\b(?:request (?:a )?quote|get (?:a )?quote|estimate|enquiry|inquiry|contact us|whatsapp|wa\.me|jobber|housecall pro|servicem8|tradify|callout|schedule service)\b/i,
    structuredDataTypes:
      /^(Plumber|Electrician|GeneralContractor|HomeAndConstructionBusiness|ProfessionalService|LocalBusiness)$/i,
    catalogLabel: "service or project list",
    conversionLabel: "quote, contact, or callout",
    structuredDataLabel:
      "trade-specific HomeAndConstructionBusiness or LocalBusiness",
  },
  audit: {
    categoryExample:
      "plumber, electrician, builder, repair service, or the actual artisan trade",
    audienceNoun: "customers",
    photoSubjects: "team, workshop, and completed project evidence",
  },
} satisfies Omit<LeadDiscoveryAdapter, "vertical"> & {
  vertical: "LOCAL_SERVICE";
};
