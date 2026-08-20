import type {
  LinkClassificationHint,
  ProviderDefinition,
} from "@/lib/verticals/types";

/**
 * Food retailers keep their current commerce tools. No provider is classified
 * as booking: preorder and click-and-collect are ordering, while courier
 * marketplaces remain delivery links.
 */
export const foodRetailProviders: ProviderDefinition[] = [
  {
    pattern: /shopify|myshopify/i,
    hostnamePattern: /^(?:[a-z0-9-]+\.)*myshopify\.com$/i,
    name: "Shopify",
    type: "ordering",
    classificationPattern: /shopify|myshopify/i,
  },
  {
    pattern: /square\.site|squareup/i,
    hostnamePattern:
      /^(?:[a-z0-9-]+\.)*(?:square\.site|squareup\.com)$/i,
    name: "Square",
    type: "ordering",
    classificationPattern: /square/i,
  },
  {
    pattern: /gloriafood/i,
    hostnamePattern: /^(?:[a-z0-9-]+\.)*gloriafood\.com$/i,
    name: "GloriaFood",
    type: "ordering",
    classificationPattern: /gloriafood/i,
  },
  {
    pattern: /flipdish/i,
    hostnamePattern: /^(?:[a-z0-9-]+\.)*flipdish\.com$/i,
    name: "Flipdish",
    type: "ordering",
    classificationPattern: /flipdish/i,
  },
  {
    pattern: /localline/i,
    hostnamePattern: /^(?:[a-z0-9-]+\.)*localline\.ca$/i,
    name: "Local Line",
    type: "ordering",
    classificationPattern: /localline|local line/i,
  },
  {
    pattern: /ubereats/i,
    hostnamePattern: /^(?:[a-z0-9-]+\.)*ubereats\.com$/i,
    name: "Uber Eats",
    type: "delivery",
    classificationPattern: /ubereats/i,
  },
  {
    pattern: /deliveroo/i,
    hostnamePattern:
      /^(?:[a-z0-9-]+\.)*deliveroo\.(?:com|co\.uk|fr|it|be|nl|ie|com\.au)$/i,
    name: "Deliveroo",
    type: "delivery",
    classificationPattern: /deliveroo/i,
  },
  {
    pattern: /wolt/i,
    hostnamePattern: /^(?:[a-z0-9-]+\.)*wolt\.com$/i,
    name: "Wolt",
    type: "delivery",
    classificationPattern: /wolt/i,
  },
  {
    pattern: /just-eat|justeat/i,
    hostnamePattern:
      /^(?:[a-z0-9-]+\.)*(?:just-eat|justeat)\.(?:com|co\.uk|fr|it|es|de|ch|ie)$/i,
    name: "Just Eat",
    type: "delivery",
    classificationPattern: /just.?eat/i,
  },
  {
    pattern: /instagram/i,
    hostnamePattern: /^(?:[a-z0-9-]+\.)*instagram\.com$/i,
    name: "Instagram",
    type: "social",
    classificationPattern: /instagram/i,
  },
  {
    pattern: /facebook/i,
    hostnamePattern: /^(?:[a-z0-9-]+\.)*facebook\.com$/i,
    name: "Facebook",
    type: "social",
    classificationPattern: /facebook/i,
  },
];

export const foodRetailLinkKeywordHints: LinkClassificationHint[] = [
  {
    type: "social",
    pattern: /instagram|facebook|tiktok|pinterest/,
  },
  {
    type: "delivery",
    pattern: /deliveroo|ubereats|wolt|just.?eat|delivery|livraison/,
  },
  {
    type: "ordering",
    pattern:
      /pre.?order|order|commande|commander|click.?and.?collect|click.?collect|pickup|pick.?up|collection|retrait|shop|boutique|basket|panier/,
  },
];

export const foodRetailRelevantPathPattern =
  /(?:product|products|produit|produits|range|gamme|shop|boutique|catalog|catalogue|bakery|boulanger|patisser|butcher|boucher|deli|epicer|fromage|cheese|season|saison|allergen|allergene|order|commande|pickup|retrait|collect|hours|horaires|contact)/i;
