import type { VerticalId } from "@/lib/verticals/types";

export type LeadDiscoveryAdapter = {
  vertical: VerticalId;
  adapterId: string;
  placeSearch: {
    googleQuery: (city: string) => string;
    googleIncludedType: string;
    nominatimQuery: (city: string) => string;
    fallbackCategory: string;
  };
  homepage: {
    catalogPattern: RegExp;
    conversionPattern: RegExp;
    structuredDataTypes: RegExp;
    catalogLabel: string;
    conversionLabel: string;
    structuredDataLabel: string;
  };
  audit: {
    categoryExample: string;
    audienceNoun: string;
    photoSubjects: string;
  };
};
