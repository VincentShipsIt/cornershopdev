import { Vertical } from "@/generated/prisma/enums";
import type { LeadDiscoveryAdapter } from "@/lib/lead-generation/types";

/**
 * FOOD_RETAIL is intentionally heterogeneous. A single Google includedType
 * would silently discard valid butchers, delis, cheesemongers, or grocers, so
 * its bounded taxonomy lives in the text query and category evidence instead.
 */
export const foodRetailLeadDiscovery = {
  vertical: Vertical.FOOD_RETAIL,
  adapterId: "food-retail-local-v1",
  placeSearch: {
    googleQuery: (city) =>
      `bakeries, pastry shops, butchers, delis, cheesemongers and grocers in ${city}`,
    googleIncludedType: null,
    nominatimQuery: (city) =>
      `bakery butcher deli cheesemonger grocery shop in ${city}`,
    fallbackCategory: "food_retail",
  },
  eligibility: {
    categoryPattern:
      /(?:^|_)(?:bakery|patisserie|pastry_shop|butcher|deli|delicatessen|cheese_shop|cheesemonger|grocery|grocery_store|supermarket|food_store|food_retail)(?:_|$)/i,
    categoryLabel: "bakery, food shop, butcher, deli, cheesemonger, or grocer",
  },
  homepage: {
    catalogPattern:
      /(?:href=["'][^"']*(?:\/products?\b|\/range\b|\/shop\b|\/catalog(?:ue)?\b|\/bread\b|\/pastr(?:y|ies)\b|\/meat\b|\/cheese\b)[^"']*["']|\b(?:products?|our range|shop online|breads?|pastries|cakes|cuts|cheeses|groceries)\b)/i,
    conversionPattern:
      /\b(?:pre.?order|order online|click.?and.?collect|pick.?up|collection|shopify|myshopify|square|gloriafood|flipdish|local line|deliveroo|wolt|just.?eat)\b/i,
    structuredDataTypes: /^(Bakery|GroceryStore|Store|LocalBusiness)$/i,
    catalogLabel: "product range or shop catalog",
    conversionLabel: "ordering, preorder, or pickup",
    structuredDataLabel: "Bakery, GroceryStore, Store, or LocalBusiness",
  },
  audit: {
    categoryExample:
      "bakery, pastry shop, butcher, deli, cheesemonger, or grocery store",
    audienceNoun: "shoppers",
    photoSubjects: "shopfront, counter, and source-backed product",
  },
} satisfies LeadDiscoveryAdapter;
