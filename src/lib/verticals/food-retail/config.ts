import { Vertical } from "@/generated/prisma/enums";
import {
  foodRetailAttributesSchema,
  foodRetailItemAttributesSchema,
  foodRetailSiteDraftSchema,
  type FoodRetailAttributes,
  type FoodRetailItemAttributes,
  type FoodRetailSiteDraft,
  type FoodShopType,
} from "@/lib/verticals/food-retail/schema";
import {
  foodRetailLinkKeywordHints,
  foodRetailProviders,
  foodRetailRelevantPathPattern,
} from "@/lib/verticals/food-retail/providers";
import { foodRetailMarketing } from "@/lib/verticals/food-retail/marketing";
import { foodRetailPrompt } from "@/lib/verticals/food-retail/prompt";
import {
  foodRetailTemplates,
  resolveFoodRetailTemplateFromAttributes,
  type FoodRetailTemplate,
} from "@/lib/verticals/food-retail/templates";
import type { VerticalConfig } from "@/lib/verticals/types";

export const foodRetailDictionaryExtensions = {
  en: {
    language: "Language",
    reservationsVia: "Order via",
    bookingPartner: "the shop’s ordering partner",
    seasonalNotice:
      "Products and availability may change. Check the current range before travelling.",
    heroImageAlt: "Shop and products at",
    bookingHeading: "Ordering",
    bookingRequestHeading: "",
    bookingRequestIntro: "",
    pickupHeading: "Pickup",
  },
  fr: {
    language: "Langue",
    reservationsVia: "Commander via",
    bookingPartner: "le partenaire de commande de la boutique",
    seasonalNotice:
      "Les produits et disponibilités peuvent évoluer. Vérifiez la gamme actuelle avant de vous déplacer.",
    heroImageAlt: "Boutique et produits chez",
    bookingHeading: "Commande",
    bookingRequestHeading: "",
    bookingRequestIntro: "",
    pickupHeading: "Retrait",
  },
} satisfies Record<string, Record<string, string>>;

const shopTypeLabels: Record<FoodShopType, Record<"en" | "fr", string>> = {
  bakery: { en: "Bakery", fr: "Boulangerie" },
  patisserie: { en: "Patisserie", fr: "Pâtisserie" },
  butcher: { en: "Butcher", fr: "Boucherie" },
  deli: { en: "Deli", fr: "Traiteur" },
  cheesemonger: { en: "Cheesemonger", fr: "Fromagerie" },
  grocer: { en: "Grocer", fr: "Épicerie" },
  "local-food-shop": { en: "Local food shop", fr: "Commerce alimentaire" },
};

function language(locale: string): "en" | "fr" {
  return locale.toLowerCase().startsWith("fr") ? "fr" : "en";
}

export const foodRetailConfig = {
  id: Vertical.FOOD_RETAIL,
  vocabulary: {
    catalog: "Product ranges",
    section: "Category",
    item: "Product",
  },
  marketing: foodRetailMarketing,
  attributesSchema: foodRetailAttributesSchema,
  attributeDefaults: {
    shopType: "local-food-shop",
    showProductImages: true,
    pickupDetails: "",
  },
  deterministicAttributes: {
    shopType: "local-food-shop",
    showProductImages: false,
    pickupDetails: "",
  },
  itemAttributesSchema: foodRetailItemAttributesSchema,
  itemAttributeDefaults: {
    stockStatus: null,
    stockSourceUrl: null,
    seasonalAvailability: "",
    preorderRequired: null,
    preorderNote: "",
    allergens: [],
    allergenSourceUrl: null,
  },
  draftSchema: foodRetailSiteDraftSchema,
  prompt: foodRetailPrompt,
  imageEnhancement: {
    subject: "local food retail photograph",
    contextLabel: "Food shop",
    forbiddenElements:
      "product, ingredient, cut, loaf, pastry, filling, finish, portion, package, label, price sign",
    sceneClause: "make the counter or shop look like a different business",
    fidelityClause: "what the shop actually makes, stocks or looks like",
    gradeClause:
      "Use a natural retail colour grade. Avoid fake steam, artificial gloss, exaggerated saturation, reshaped products, replaced packaging, fake depth of field, and stock-photo polish.",
  },
  presentation: {
    fallbackDescription:
      "An independent local food shop with product ranges, opening hours and pickup details presented clearly.",
    fallbackPalette: {
      background: "#f5efe3",
      foreground: "#2a2118",
      accent: "#a34f2d",
    },
    buildEyebrow: (attributes, site) =>
      `${shopTypeLabels[attributes.shopType].en} · ${site.address ?? "Local"}`,
    itemBadges: (attributes, locale) => {
      const localeLanguage = language(locale);
      const badges: string[] = [];
      if (attributes.stockSourceUrl && attributes.stockStatus === "in-stock") {
        badges.push(localeLanguage === "fr" ? "En stock" : "In stock");
      }
      if (
        attributes.stockSourceUrl &&
        attributes.stockStatus === "out-of-stock"
      ) {
        badges.push(localeLanguage === "fr" ? "Rupture de stock" : "Out of stock");
      }
      if (attributes.seasonalAvailability) {
        badges.push(attributes.seasonalAvailability);
      }
      if (attributes.preorderRequired === true) {
        badges.push(localeLanguage === "fr" ? "Précommande" : "Preorder");
      }
      if (attributes.preorderNote) badges.push(attributes.preorderNote);
      if (attributes.allergens.length > 0 && attributes.allergenSourceUrl) {
        badges.push(
          `${localeLanguage === "fr" ? "Allergènes" : "Allergens"}: ${attributes.allergens.join(", ")}`,
        );
      }
      return badges;
    },
    fulfillmentNote: (attributes) => attributes.pickupDetails || null,
  },
  templates: {
    definitions: foodRetailTemplates,
    resolve: resolveFoodRetailTemplateFromAttributes,
  },
  normalizeGeneratedAttributes: (attributes, template) => ({
    ...attributes,
    showProductImages: template.showProductImagesByDefault,
  }),
  generatedTranslationStatus: "draft",
  providers: foodRetailProviders,
  crawl: {
    relevantPathPattern: foodRetailRelevantPathPattern,
    linkKeywordHints: foodRetailLinkKeywordHints,
  },
  i18n: foodRetailDictionaryExtensions,
  rendererCapabilities: (attributes) => ({
    showGallery: attributes.showProductImages,
    primaryAction: "ordering",
    bookingRequestMode: "never",
  }),
} satisfies VerticalConfig<
  FoodRetailAttributes,
  FoodRetailItemAttributes,
  FoodRetailTemplate,
  FoodRetailSiteDraft
>;
