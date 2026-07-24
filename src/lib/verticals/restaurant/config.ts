import { Vertical } from "@/generated/prisma/enums";
import {
  restaurantAttributesSchema,
  restaurantItemAttributesSchema,
  restaurantSiteDraftSchema,
  sampleRestaurant,
  type RestaurantAttributes,
  type RestaurantItemAttributes,
  type RestaurantSiteDraft,
} from "@/lib/verticals/restaurant/schema";
import {
  restaurantLinkKeywordHints,
  restaurantProviders,
  restaurantRelevantPathPattern,
} from "@/lib/verticals/restaurant/providers";
import { restaurantPrompt } from "@/lib/verticals/restaurant/prompt";
import {
  restaurantTemplates,
  resolveRestaurantTemplateFromAttributes,
  type RestaurantTemplate,
} from "@/lib/verticals/restaurant/templates";
import type { VerticalConfig } from "@/lib/verticals/types";

export const restaurantDictionaryExtensions = {
  en: {
    language: "Language",
    reservationsVia: "Reservations via",
    bookingPartner: "our booking partner",
    seasonalNotice: "Menu and availability may change with the season.",
    // Read by the shared renderer for the hero `alt`, so the key is generic even
    // though the restaurant phrasing behind it is not.
    heroImageAlt: "Dining room at",
  },
  fr: {
    language: "Langue",
    reservationsVia: "Réservations via",
    bookingPartner: "notre partenaire de réservation",
    seasonalNotice:
      "Le menu et les disponibilités peuvent évoluer au fil des saisons.",
    heroImageAlt: "Salle du restaurant",
  },
} satisfies Record<string, Record<string, string>>;

export const restaurantConfig = {
  id: Vertical.RESTAURANT,
  vocabulary: {
    catalog: "Menu",
    section: "Section",
    item: "Dish",
  },
  attributesSchema: restaurantAttributesSchema,
  attributeDefaults: {
    cuisine: "",
    showMenuImages: false,
  },
  itemAttributesSchema: restaurantItemAttributesSchema,
  itemAttributeDefaults: {
    dietaryLabels: [],
  },
  draftSchema: restaurantSiteDraftSchema,
  prompt: restaurantPrompt,
  imageEnhancement: {
    subject: "restaurant photograph",
    contextLabel: "Restaurant",
    forbiddenElements:
      "food, ingredient, garnish, sauce, portion, plating, tableware",
    sceneClause: "make the scene look like a different service",
    fidelityClause: "what the restaurant actually serves or looks like",
    gradeClause:
      "Use a natural hospitality colour grade. Avoid plastic textures, exaggerated saturation, fake steam, fake depth of field, and stock-photo polish.",
  },
  // Sourced from the sample fixture so the read-path fallbacks stay byte-identical
  // to the pre-registry behaviour rather than drifting into a second copy.
  presentation: {
    fallbackDescription: sampleRestaurant.description,
    fallbackPalette: sampleRestaurant.palette,
    buildEyebrow: (attributes, site) =>
      `${attributes.cuisine || "Independent restaurant"} · ${site.address ?? "Local"}`,
    // Dietary labels are the restaurant's badge set. The renderer only receives the
    // resulting strings, so `dietaryLabels` never appears outside this vertical.
    itemBadges: (attributes) => attributes.dietaryLabels,
  },
  templates: {
    definitions: restaurantTemplates,
    resolve: resolveRestaurantTemplateFromAttributes,
  },
  normalizeGeneratedAttributes: (attributes, template) => ({
    ...attributes,
    showMenuImages: template.showMenuImagesByDefault,
  }),
  providers: restaurantProviders,
  crawl: {
    relevantPathPattern: restaurantRelevantPathPattern,
    linkKeywordHints: restaurantLinkKeywordHints,
  },
  i18n: restaurantDictionaryExtensions,
  rendererCapabilities: (attributes) => ({
    showGallery: attributes.showMenuImages,
    showBookingRequestForm: false,
  }),
} satisfies VerticalConfig<
  RestaurantAttributes,
  RestaurantItemAttributes,
  RestaurantTemplate,
  RestaurantSiteDraft
>;
