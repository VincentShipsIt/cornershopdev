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
    hostnamePattern:
      /^(?:[a-z0-9-]+\.)*opentable\.(?:com|co\.uk|de|fr|it|nl|ie|ca|com\.au)$/i,
    name: "OpenTable",
    type: "booking",
    classificationPattern: /opentable/i,
    embed: openTableEmbed,
  },
  {
    pattern: /sevenrooms/i,
    hostnamePattern: /^(?:[a-z0-9-]+\.)*sevenrooms\.com$/i,
    name: "SevenRooms",
    type: "booking",
    classificationPattern: /sevenrooms/i,
  },
  {
    pattern: /resy/i,
    hostnamePattern: /^(?:[a-z0-9-]+\.)*resy\.com$/i,
    name: "Resy",
    type: "booking",
    classificationPattern: /resy/i,
  },
  {
    pattern: /thefork|lafourchette/i,
    hostnamePattern:
      /^(?:[a-z0-9-]+\.)*(?:thefork\.(?:com|fr|it|de|es|nl|be|ch)|lafourchette\.com)$/i,
    name: "TheFork",
    type: "booking",
    classificationPattern: /thefork/i,
  },
  {
    pattern: /quandoo/i,
    hostnamePattern:
      /^(?:[a-z0-9-]+\.)*quandoo\.(?:com|co\.uk|de|it|fr|nl|ch|at)$/i,
    name: "Quandoo",
    type: "booking",
    classificationPattern: /quandoo/i,
  },
  {
    pattern: /bookatable/i,
    hostnamePattern:
      /^(?:[a-z0-9-]+\.)*bookatable\.(?:com|co\.uk)$/i,
    name: "Bookatable",
    type: "booking",
  },
  {
    pattern: /toasttab/i,
    hostnamePattern: /^(?:[a-z0-9-]+\.)*toasttab\.com$/i,
    name: "Toast",
    type: "ordering",
    classificationPattern: /toasttab/i,
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
    pattern: /zenchef/i,
    hostnamePattern: /^(?:[a-z0-9-]+\.)*zenchef\.com$/i,
    name: "Zenchef",
    type: "booking",
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

export function findRestaurantProviderByUrl(url: string) {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return null;
  }
  return (
    restaurantProviders.find((provider) =>
      provider.hostnamePattern?.test(hostname),
    ) ??
    null
  );
}

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
