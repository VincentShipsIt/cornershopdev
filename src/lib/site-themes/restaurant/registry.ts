import {
  RESTAURANT_THEME_RENDERER_VERSION,
  restaurantThemeTokensSchema,
  type RestaurantBrandTrait,
  type RestaurantMenuExperience,
  type RestaurantPhotographyQuality,
  type RestaurantPricePosition,
  type RestaurantPrimaryIntent,
  type RestaurantServiceModel,
  type RestaurantThemeId,
  type RestaurantThemeTokens,
} from "@/lib/site-themes/restaurant/contracts";

export type RestaurantThemeCapabilities = {
  categoryNavigation: boolean;
  menuSearch: boolean;
  stickyOrderAction: boolean;
  reservationEmphasis: boolean;
  eventsEmphasis: boolean;
};

export type RestaurantThemeManifest = {
  id: RestaurantThemeId;
  rendererVersion: typeof RESTAURANT_THEME_RENDERER_VERSION;
  name: string;
  description: string;
  previewFixtureId: string;
  experience: {
    primaryIntent: RestaurantPrimaryIntent;
    menuExperience: RestaurantMenuExperience;
  };
  fitSignals: {
    serviceModels: RestaurantServiceModel[];
    primaryIntents: RestaurantPrimaryIntent[];
    menuExperiences: RestaurantMenuExperience[];
    brandTraits: RestaurantBrandTrait[];
    pricePositions: RestaurantPricePosition[];
    photographyQualities: RestaurantPhotographyQuality[];
    multipleLocations: boolean;
  };
  avoidanceSignals: {
    serviceModels: RestaurantServiceModel[];
    primaryIntents: RestaurantPrimaryIntent[];
    menuExperiences: RestaurantMenuExperience[];
    photographyQualities: RestaurantPhotographyQuality[];
  };
  bestFor: string[];
  avoidWhen: string[];
  capabilities: RestaurantThemeCapabilities;
  safeDefaultTokens: RestaurantThemeTokens;
  aiBrief: string;
};

const manifests = {
  "terroir-editorial": {
    id: "terroir-editorial",
    rendererVersion: RESTAURANT_THEME_RENDERER_VERSION,
    name: "Terroir Editorial",
    description:
      "A quiet reservation-led story for destination dining, seasonal menus and strong photography.",
    previewFixtureId: "maison-serein",
    experience: {
      primaryIntent: "reserve",
      menuExperience: "editorial",
    },
    fitSignals: {
      serviceModels: ["fine-dining", "full-service"],
      primaryIntents: ["reserve", "visit"],
      menuExperiences: ["editorial", "catalog"],
      brandTraits: ["classic", "craft", "minimal"],
      pricePositions: ["midmarket", "premium"],
      photographyQualities: ["limited", "strong"],
      multipleLocations: false,
    },
    avoidanceSignals: {
      serviceModels: ["fast-casual", "takeaway"],
      primaryIntents: ["order"],
      menuExperiences: ["commerce"],
      photographyQualities: ["none"],
    },
    bestFor: [
      "Chef-led and seasonal restaurants",
      "Short tasting or à la carte menus",
      "Reservation and place-led storytelling",
    ],
    avoidWhen: [
      "Ordering is the main customer action",
      "The menu needs dense product browsing",
      "There is no usable restaurant photography",
    ],
    capabilities: {
      categoryNavigation: false,
      menuSearch: false,
      stickyOrderAction: false,
      reservationEmphasis: true,
      eventsEmphasis: false,
    },
    safeDefaultTokens: restaurantThemeTokensSchema.parse({
      colors: {
        background: "#f2eee4",
        foreground: "#20231f",
        surface: "#e4ded0",
        accent: "#7f3f2e",
        accentForeground: "#ffffff",
      },
      style: {
        fontPair: "editorial",
        density: "airy",
        radius: "none",
        imageTreatment: "natural",
      },
    }),
    aiBrief:
      "Choose for reservation-led destination dining with restrained copy, seasonal menus and credible photography.",
  },
  "counter-service": {
    id: "counter-service",
    rendererVersion: RESTAURANT_THEME_RENDERER_VERSION,
    name: "Counter Service",
    description:
      "A bright order-first storefront for fast menus, collection and external delivery handoff.",
    previewFixtureId: "fold-pizza",
    experience: {
      primaryIntent: "order",
      menuExperience: "commerce",
    },
    fitSignals: {
      serviceModels: ["fast-casual", "cafe-bakery", "takeaway"],
      primaryIntents: ["order", "visit"],
      menuExperiences: ["commerce", "catalog"],
      brandTraits: ["playful", "energetic", "craft"],
      pricePositions: ["value", "midmarket"],
      photographyQualities: ["none", "limited", "strong"],
      multipleLocations: true,
    },
    avoidanceSignals: {
      serviceModels: ["fine-dining"],
      primaryIntents: ["reserve"],
      menuExperiences: ["editorial"],
      photographyQualities: [],
    },
    bestFor: [
      "Fast casual, takeaway and counter service",
      "Menus customers browse before ordering",
      "Existing collection or delivery providers",
    ],
    avoidWhen: [
      "Reservations are the primary conversion",
      "The menu is intentionally short and editorial",
      "The restaurant needs a quiet luxury tone",
    ],
    capabilities: {
      categoryNavigation: true,
      menuSearch: false,
      stickyOrderAction: true,
      reservationEmphasis: false,
      eventsEmphasis: false,
    },
    safeDefaultTokens: restaurantThemeTokensSchema.parse({
      colors: {
        background: "#fff7df",
        foreground: "#172118",
        surface: "#ffffff",
        accent: "#d94028",
        accentForeground: "#ffffff",
      },
      style: {
        fontPair: "grotesk",
        density: "compact",
        radius: "round",
        imageTreatment: "graphic",
      },
    }),
    aiBrief:
      "Choose for fast-casual or takeaway restaurants where customers need category browsing and a clear external order handoff.",
  },
  "after-dark": {
    id: "after-dark",
    rendererVersion: RESTAURANT_THEME_RENDERER_VERSION,
    name: "After Dark",
    description:
      "An atmospheric late-night stage for bars, dining rooms, reservations and event-led visits.",
    previewFixtureId: "nightjar-room",
    experience: {
      primaryIntent: "reserve",
      menuExperience: "catalog",
    },
    fitSignals: {
      serviceModels: ["bar-nightlife", "full-service"],
      primaryIntents: ["reserve", "visit"],
      menuExperiences: ["catalog", "editorial"],
      brandTraits: ["atmospheric", "energetic", "classic"],
      pricePositions: ["midmarket", "premium"],
      photographyQualities: ["limited", "strong"],
      multipleLocations: false,
    },
    avoidanceSignals: {
      serviceModels: ["cafe-bakery", "takeaway"],
      primaryIntents: ["order"],
      menuExperiences: ["commerce"],
      photographyQualities: ["none"],
    },
    bestFor: [
      "Cocktail bars and late-night dining",
      "Reservation, private-hire or event-led venues",
      "Atmospheric interiors and evening photography",
    ],
    avoidWhen: [
      "Daytime counter service is the core business",
      "External ordering is the main conversion",
      "Dark presentation conflicts with the real brand",
    ],
    capabilities: {
      categoryNavigation: false,
      menuSearch: false,
      stickyOrderAction: false,
      reservationEmphasis: true,
      eventsEmphasis: true,
    },
    safeDefaultTokens: restaurantThemeTokensSchema.parse({
      colors: {
        background: "#111010",
        foreground: "#f5efe4",
        surface: "#211d1c",
        accent: "#e85d3f",
        accentForeground: "#111010",
      },
      style: {
        fontPair: "condensed",
        density: "balanced",
        radius: "soft",
        imageTreatment: "cinematic",
      },
    }),
    aiBrief:
      "Choose for bars, nightlife and evening restaurants with atmospheric imagery, reservation intent and event or private-hire relevance.",
  },
} satisfies Record<RestaurantThemeId, RestaurantThemeManifest>;

export function listRestaurantThemeManifests(): RestaurantThemeManifest[] {
  return Object.values(manifests);
}

export function getRestaurantThemeManifest(
  id: RestaurantThemeId,
): RestaurantThemeManifest {
  return manifests[id];
}

export function findRestaurantThemeManifest(
  id: string,
): RestaurantThemeManifest | null {
  return (manifests as Record<string, RestaurantThemeManifest>)[id] ?? null;
}
