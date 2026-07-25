import type {
  LinkClassificationHint,
  ProviderDefinition,
} from "@/lib/verticals/types";

/**
 * No beauty provider carries an `embed`, so every one of them degrades to a
 * "Book on X" link-out — the same path SevenRooms, Resy, TheFork and Zenchef take
 * in `restaurant/providers.ts`.
 *
 * That is not an oversight. Booksy, Fresha, Vagaro, StyleSeat and Squire all
 * distribute their widget as per-account markup generated inside the owner's own
 * dashboard; none of them publishes a documented iframe URL addressable by a
 * venue id. Inventing one would mean framing a guessed third-party URL built from
 * owner input, which is exactly what `ProviderEmbedDefinition`'s anchored
 * `idPattern` plus the CSP origin allow-list exist to prevent. When a provider
 * documents a stable iframe endpoint, adding the descriptor here is the only
 * change needed — `listEmbedFrameOrigins()` widens the policy on its own.
 *
 * Consequence for this vertical: `rendererCapabilities` turns the booking-request
 * form on, so a salon with only a Booksy link still captures leads on-page.
 */
export const beautyProviders: ProviderDefinition[] = [
  {
    pattern: /booksy/i,
    name: "Booksy",
    type: "booking",
    classificationPattern: /booksy/i,
  },
  {
    pattern: /fresha|shedul/i,
    name: "Fresha",
    type: "booking",
    classificationPattern: /fresha/i,
  },
  {
    pattern: /vagaro/i,
    name: "Vagaro",
    type: "booking",
    classificationPattern: /vagaro/i,
  },
  {
    pattern: /styleseat/i,
    name: "StyleSeat",
    type: "booking",
    classificationPattern: /styleseat/i,
  },
  {
    pattern: /getsquire|squire\.to/i,
    name: "Squire",
    type: "booking",
    classificationPattern: /squire/i,
  },
  {
    pattern: /treatwell/i,
    name: "Treatwell",
    type: "booking",
    classificationPattern: /treatwell/i,
  },
  {
    // The dominant salon booking tool in France, and this vertical ships an `fr`
    // dictionary, so it earns a row next to the US/UK incumbents.
    pattern: /planity/i,
    name: "Planity",
    type: "booking",
    classificationPattern: /planity/i,
  },
  {
    pattern: /phorest/i,
    name: "Phorest",
    type: "booking",
    classificationPattern: /phorest/i,
  },
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
  {
    pattern: /tiktok/i,
    name: "TikTok",
    type: "social",
    classificationPattern: /tiktok/i,
  },
];

/**
 * No `ordering` or `delivery` hint: a salon has nothing to deliver, and leaving
 * those types unmatched keeps a stray "shop" link from being promoted into a
 * commerce CTA the business does not operate.
 */
export const beautyLinkKeywordHints: LinkClassificationHint[] = [
  {
    type: "social",
    pattern: /instagram|facebook|tiktok|pinterest|linkedin/,
  },
  {
    type: "booking",
    pattern:
      /book|booking|appointment|reserve|rendez.?vous|reservation|booksy|fresha|vagaro|styleseat|squire|treatwell|planity|phorest/,
  },
];

export const beautyRelevantPathPattern =
  /(?:service|services|prestation|tarif|tarifs|price|prices|pricing|menu|salon|barber|coiffure|coiffeur|beaute|beauty|spa|nail|ongle|hair|treatment|soin|book|rendez)/i;
