import { Vertical } from "@/generated/prisma/enums";
import {
  restaurantAttributesSchema,
  restaurantItemAttributesSchema,
  restaurantSiteDraftSchema,
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
    diningRoomAlt: "Dining room at",
  },
  fr: {
    language: "Langue",
    reservationsVia: "Réservations via",
    bookingPartner: "notre partenaire de réservation",
    seasonalNotice:
      "Le menu et les disponibilités peuvent évoluer au fil des saisons.",
    diningRoomAlt: "Salle du restaurant",
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
