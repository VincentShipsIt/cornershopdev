import type {
  LinkClassificationHint,
  ProviderDefinition,
  ProviderEmbedDefinition,
} from "@/lib/verticals/types";

/**
 * OpenTable is the only restaurant provider with an official *iframe* widget.
 * SevenRooms, Resy, TheFork and Zenchef all publish script-tag widgets instead,
 * so they intentionally carry no `embed` and degrade to a link-out — see
 * `ProviderEmbedDefinition` for why script embeds are out of scope.
 *
 * The reservation canvas is always addressed on the `.com` host with
 * `domain=com` regardless of which OpenTable locale the owner's link used, so
 * the CSP allow-list stays a single origin.
 */
const openTableEmbed: ProviderEmbedDefinition = {
  origin: "https://www.opentable.com",
  // OpenTable restaurant ids ("rid") are plain integers.
  idPattern: /^[0-9]{1,12}$/,
  extractVenueId: (url) => {
    try {
      return new URL(url).searchParams.get("rid");
    } catch {
      return null;
    }
  },
  buildSrc: (venueId) =>
    `https://www.opentable.com/widget/reservation/canvas?rid=${venueId}&type=standard&theme=standard&domain=com&lang=en-US&overlay=false&iframe=true`,
  height: 320,
};

export const restaurantProviders: ProviderDefinition[] = [
  {
    pattern: /opentable/i,
    name: "OpenTable",
    type: "booking",
    classificationPattern: /opentable/i,
    embed: openTableEmbed,
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
