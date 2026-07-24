import type {
  LinkClassificationHint,
  ProviderDefinition,
} from "@/lib/verticals/types";

export const restaurantProviders: ProviderDefinition[] = [
  {
    pattern: /opentable/i,
    name: "OpenTable",
    type: "booking",
    classificationPattern: /opentable/i,
  },
  {
    pattern: /sevenrooms/i,
    name: "SevenRooms",
    type: "booking",
    classificationPattern: /sevenrooms/i,
  },
  {
    pattern: /resy/i,
    name: "Resy",
    type: "booking",
    classificationPattern: /resy/i,
  },
  {
    pattern: /thefork|lafourchette/i,
    name: "TheFork",
    type: "booking",
    classificationPattern: /thefork/i,
  },
  {
    pattern: /quandoo/i,
    name: "Quandoo",
    type: "booking",
    classificationPattern: /quandoo/i,
  },
  { pattern: /bookatable/i, name: "Bookatable", type: "booking" },
  {
    pattern: /toasttab/i,
    name: "Toast",
    type: "ordering",
    classificationPattern: /toasttab/i,
  },
  {
    pattern: /square\.site|squareup/i,
    name: "Square",
    type: "ordering",
    classificationPattern: /square/i,
  },
  {
    pattern: /ubereats/i,
    name: "Uber Eats",
    type: "delivery",
    classificationPattern: /ubereats/i,
  },
  {
    pattern: /deliveroo/i,
    name: "Deliveroo",
    type: "delivery",
    classificationPattern: /deliveroo/i,
  },
  {
    pattern: /wolt/i,
    name: "Wolt",
    type: "delivery",
    classificationPattern: /wolt/i,
  },
  {
    pattern: /just-eat|justeat/i,
    name: "Just Eat",
    type: "delivery",
    classificationPattern: /just.?eat/i,
  },
  { pattern: /zenchef/i, name: "Zenchef", type: "booking" },
  {
    pattern: /instagram/i,
    name: "Instagram",
    type: "social",
    classificationPattern: /instagram/i,
  },
  {
    pattern: /facebook/i,
    name: "Facebook",
    type: "social",
    classificationPattern: /facebook/i,
  },
];

export const restaurantLinkKeywordHints: LinkClassificationHint[] = [
  {
    type: "social",
    pattern: /instagram|facebook|tiktok|linkedin/,
  },
  {
    type: "delivery",
    pattern: /deliveroo|ubereats|wolt|just.?eat|delivery/,
  },
  {
    type: "booking",
    pattern: /book|reservation|reserve|opentable|sevenrooms|resy|thefork|quandoo/,
  },
  {
    type: "ordering",
    pattern: /order|takeaway|takeout|collection|toasttab|square/,
  },
];

export const restaurantRelevantPathPattern =
  /(?:menu|menus|carte|restaurant|cuisine|food|drink|boisson|groupe|semaine|week|lunch|dinner|speise|carta)/i;
