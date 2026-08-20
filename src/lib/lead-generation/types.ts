import type { VerticalId } from "@/lib/verticals/types";

export type LeadDiscoveryAdapter = {
  vertical: VerticalId;
  adapterId: string;
  placeSearch: {
    googleQuery: (city: string) => string;
    /** Omit for verticals that deliberately span several incompatible place types. */
    googleIncludedType: string | null;
    nominatimQuery: (city: string) => string;
    fallbackCategory: string;
  };
  eligibility: {
    /** Confirms niche fit from provider taxonomy; never makes a legal decision. */
    categoryPattern: RegExp;
    categoryLabel: string;
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

export type LeadCategoryFit = "matched" | "unconfirmed" | "mismatch";
