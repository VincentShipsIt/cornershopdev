import { z } from "zod";

export const imageProvenanceSchema = z.enum([
  "official",
  "owner",
  "permissioned-ugc",
]);

const restaurantImageUrlSchema = z.union([
  z.url(),
  z.string().regex(/^\/[a-zA-Z0-9/_\-.]+$/),
]);

export const restaurantAttributesSchema = z.object({
  cuisine: z.string().max(80).default(""),
  showMenuImages: z.boolean().default(false),
});

export const restaurantItemAttributesSchema = z.object({
  dietaryLabels: z.array(z.string().max(30)).max(6).default([]),
});

export const catalogItemSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(320).default(""),
  price: z.number().nonnegative().nullable().default(null),
  currency: z.string().length(3).default("EUR"),
  imageUrl: restaurantImageUrlSchema.nullable().default(null),
  originalImageUrl: restaurantImageUrlSchema.nullable().optional(),
  imageProvenance: imageProvenanceSchema.nullable().optional(),
  attributes: z.record(z.string(), z.unknown()).default({}),
});

export const catalogSectionSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(240).default(""),
  items: z.array(catalogItemSchema).max(40),
});

export const menuItemSchema = catalogItemSchema
  .omit({ attributes: true })
  .extend(restaurantItemAttributesSchema.shape);

export const menuSectionSchema = catalogSectionSchema.extend({
  items: z.array(menuItemSchema).max(40),
});

export const integrationSchema = z.object({
  type: z.enum(["booking", "ordering", "delivery", "social"]),
  label: z.string().min(1).max(60),
  provider: z.string().max(60).nullable().default(null),
  url: z.url(),
  /**
   * The owner's id inside the provider, used to build an embedded booking
   * widget. Bounded here only for storage sanity — the value is never trusted
   * on its own: `resolveBookingEmbed` re-checks it against the provider's own
   * anchored `idPattern` before any frame is rendered.
   */
  venueId: z.string().max(120).nullable().default(null),
});

export const localeSchema = z
  .string()
  .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/, "Use a BCP 47 language code");

const translatedCatalogItemSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(320).default(""),
  attributes: z.record(z.string(), z.unknown()).default({}),
});

const translatedCatalogSectionSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(240).default(""),
  items: z.array(translatedCatalogItemSchema),
});

export const baseSiteTranslationSchema = z.object({
  locale: localeSchema,
  eyebrow: z.string().max(100),
  description: z.string().min(20).max(500),
  attributes: z.record(z.string(), z.unknown()).default({}),
  catalogSections: z.array(translatedCatalogSectionSchema),
  integrationLabels: z.array(z.string().min(1).max(60)).max(12),
});

const restaurantSiteTranslationSchema = baseSiteTranslationSchema.extend({
  attributes: restaurantAttributesSchema.pick({ cuisine: true }),
  catalogSections: z.array(
    translatedCatalogSectionSchema.extend({
      items: z.array(
        translatedCatalogItemSchema.extend({
          attributes: restaurantItemAttributesSchema,
        }),
      ),
    }),
  ),
});

export const restaurantTranslationSchema = z.object({
  locale: localeSchema,
  cuisine: z.string().max(80),
  eyebrow: z.string().max(100),
  description: z.string().min(20).max(500),
  menuSections: z.array(
    z.object({
      name: z.string().min(1).max(80),
      description: z.string().max(240).default(""),
      items: z.array(
        z.object({
          name: z.string().min(1).max(120),
          description: z.string().max(320).default(""),
          dietaryLabels: z.array(z.string().max(30)).max(6).default([]),
        }),
      ),
    }),
  ),
  integrationLabels: z.array(z.string().min(1).max(60)).max(12),
});

const baseSiteDraftCoreShape = {
  slug: z.string().min(2).max(80),
  name: z.string().min(2).max(120),
  eyebrow: z.string().max(100),
  description: z.string().min(20).max(500),
  address: z.string().max(220),
  phone: z.string().max(40),
  sourceUrl: z.url().nullable(),
  heroImageUrl: z.url().nullable(),
  heroOriginalImageUrl: z.url().nullable().optional(),
  heroImageProvenance: imageProvenanceSchema.nullable().optional(),
  palette: z.object({
    background: z.string(),
    foreground: z.string(),
    accent: z.string(),
  }),
  autoEnhanceImages: z.boolean().default(true),
  defaultLocale: localeSchema.default("en"),
  integrations: z.array(integrationSchema).max(12),
};

export const baseSiteDraftSchema = z
  .object({
    ...baseSiteDraftCoreShape,
    attributes: z.record(z.string(), z.unknown()).default({}),
    translations: z.array(baseSiteTranslationSchema).max(8).default([]),
    catalogSections: z.array(catalogSectionSchema).min(1).max(12),
  })
  .superRefine(assertTranslationParity);

export const restaurantSiteDraftSchema = z
  .object({
    ...baseSiteDraftCoreShape,
    attributes: restaurantAttributesSchema,
    translations: z
      .array(restaurantSiteTranslationSchema)
      .max(8)
      .default([]),
    catalogSections: z
      .array(
        catalogSectionSchema.extend({
          items: z
            .array(
              catalogItemSchema.extend({
                attributes: restaurantItemAttributesSchema,
              }),
            )
            .max(40),
        }),
      )
      .min(1)
      .max(12),
  })
  .superRefine(assertTranslationParity);

export const restaurantDraftSchema = z
  .object({
    ...baseSiteDraftCoreShape,
    ...restaurantAttributesSchema.shape,
  translations: z.array(restaurantTranslationSchema).max(8).default([]),
    menuSections: z.array(menuSectionSchema).min(1).max(12),
  })
  .superRefine((draft, context) => {
    assertTranslationParity(
      {
        defaultLocale: draft.defaultLocale,
        catalogSections: draft.menuSections,
        integrations: draft.integrations,
        translations: draft.translations.map((translation) => ({
          locale: translation.locale,
          catalogSections: translation.menuSections,
          integrationLabels: translation.integrationLabels,
        })),
      },
      context,
      "menuSections",
      "menu",
    );
  });

type TranslationParityDraft = {
  defaultLocale: string;
  catalogSections: Array<{ items: unknown[] }>;
  integrations: unknown[];
  translations: Array<{
    locale: string;
    catalogSections: Array<{ items: unknown[] }>;
    integrationLabels: unknown[];
  }>;
};

export function assertTranslationParity(
  draft: TranslationParityDraft,
  context: z.RefinementCtx,
  sectionFieldName = "catalogSections",
  catalogName = "catalog",
): void {
  const translatedLocales = new Set<string>();
  draft.translations.forEach((translation, translationIndex) => {
    if (translation.locale === draft.defaultLocale) {
      context.addIssue({
        code: "custom",
        path: ["translations"],
        message: "Translations must not repeat the canonical locale",
      });
    }
    if (translatedLocales.has(translation.locale)) {
      context.addIssue({
        code: "custom",
        path: ["translations"],
        message: `Duplicate translation locale: ${translation.locale}`,
      });
    }
    translatedLocales.add(translation.locale);
    if (translation.catalogSections.length !== draft.catalogSections.length) {
      context.addIssue({
        code: "custom",
        path: ["translations", translationIndex, sectionFieldName],
        message: `Translated ${catalogName} sections must match the canonical ${catalogName}`,
      });
      return;
    }
    translation.catalogSections.forEach((section, sectionIndex) => {
      if (
        section.items.length !== draft.catalogSections[sectionIndex].items.length
      ) {
        context.addIssue({
          code: "custom",
          path: [
            "translations",
            translationIndex,
            sectionFieldName,
            sectionIndex,
            "items",
          ],
          message: `Translated ${catalogName} items must match the canonical ${catalogName}`,
        });
      }
    });
    if (translation.integrationLabels.length !== draft.integrations.length) {
      context.addIssue({
        code: "custom",
        path: ["translations", translationIndex, "integrationLabels"],
        message: "Translated integration labels must match the canonical links",
      });
    }
  });
}

export type RestaurantAttributes = z.infer<typeof restaurantAttributesSchema>;
export type RestaurantItemAttributes = z.infer<
  typeof restaurantItemAttributesSchema
>;
export type RestaurantDraft = z.infer<typeof restaurantDraftSchema>;
export type RestaurantSiteDraft = z.infer<typeof restaurantSiteDraftSchema>;
export type RestaurantLocale = z.infer<typeof localeSchema>;

const sampleRestaurantFixture = restaurantDraftSchema.parse({
  slug: "osteria-luna",
  name: "Osteria Luna",
  eyebrow: "Seasonal Italian kitchen · Valletta",
  description:
    "A neighbourhood osteria serving handmade pasta, charcoal-grilled fish and the kind of long lunches that quietly become dinner.",
  cuisine: "Modern Italian",
  address: "17 Old Bakery Street, Valletta, Malta",
  phone: "+356 2123 4567",
  sourceUrl: "https://example.com",
  heroImageUrl:
    "https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1800&q=88",
  heroOriginalImageUrl:
    "https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1800&q=88",
  heroImageProvenance: "owner",
  palette: {
    background: "#f4efe5",
    foreground: "#1d241f",
    accent: "#a5482d",
  },
  showMenuImages: true,
  autoEnhanceImages: true,
  defaultLocale: "en",
  translations: [],
  menuSections: [
    {
      name: "To begin",
      description: "Small plates for the table",
      items: [
        {
          name: "House focaccia",
          description: "Rosemary, sea salt, cultured butter",
          price: 6,
          currency: "EUR",
          dietaryLabels: ["vegetarian"],
          imageUrl: null,
        },
        {
          name: "Burrata & citrus",
          description: "Blood orange, basil oil, toasted pistachio",
          price: 14,
          currency: "EUR",
          dietaryLabels: ["vegetarian", "gluten-free"],
          imageUrl:
            "https://images.unsplash.com/photo-1625943555419-56a2cb596640?auto=format&fit=crop&w=1000&q=85",
        },
      ],
    },
    {
      name: "Pasta & mains",
      description: "Made here, served when ready",
      items: [
        {
          name: "Tagliolini al limone",
          description: "Lemon, aged parmesan, black pepper",
          price: 19,
          currency: "EUR",
          dietaryLabels: ["vegetarian"],
          imageUrl:
            "https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=1000&q=85",
        },
        {
          name: "Charcoal sea bass",
          description: "Braised fennel, capers, preserved lemon",
          price: 27,
          currency: "EUR",
          dietaryLabels: ["gluten-free"],
          imageUrl:
            "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=1000&q=85",
        },
        {
          name: "Slow-cooked short rib",
          description: "Soft polenta, red wine jus, gremolata",
          price: 29,
          currency: "EUR",
          dietaryLabels: ["gluten-free"],
          imageUrl: null,
        },
      ],
    },
  ],
  integrations: [
    {
      type: "booking",
      label: "Book a table",
      provider: "SevenRooms",
      url: "https://www.sevenrooms.com",
    },
    {
      type: "ordering",
      label: "Order collection",
      provider: "Existing ordering",
      url: "https://example.com/order",
    },
  ],
});

export const sampleSiteDraft: RestaurantSiteDraft =
  fromRestaurantDraft(sampleRestaurantFixture);

export const sampleRestaurant: RestaurantDraft =
  toRestaurantDraft(sampleSiteDraft);

export function toRestaurantDraft(
  draft: RestaurantSiteDraft,
): RestaurantDraft {
  return restaurantDraftSchema.parse({
    slug: draft.slug,
    name: draft.name,
    eyebrow: draft.eyebrow,
    description: draft.description,
    cuisine: draft.attributes.cuisine,
    address: draft.address,
    phone: draft.phone,
    sourceUrl: draft.sourceUrl,
    heroImageUrl: draft.heroImageUrl,
    heroOriginalImageUrl: draft.heroOriginalImageUrl,
    heroImageProvenance: draft.heroImageProvenance,
    palette: draft.palette,
    showMenuImages: draft.attributes.showMenuImages,
    autoEnhanceImages: draft.autoEnhanceImages,
    defaultLocale: draft.defaultLocale,
    translations: draft.translations.map((translation) => ({
      locale: translation.locale,
      cuisine: translation.attributes.cuisine,
      eyebrow: translation.eyebrow,
      description: translation.description,
      menuSections: translation.catalogSections.map((section) => ({
        name: section.name,
        description: section.description,
        items: section.items.map((item) => ({
          name: item.name,
          description: item.description,
          dietaryLabels: item.attributes.dietaryLabels,
        })),
      })),
      integrationLabels: translation.integrationLabels,
    })),
    menuSections: draft.catalogSections.map((section) => ({
      name: section.name,
      description: section.description,
      items: section.items.map((item) => ({
        name: item.name,
        description: item.description,
        price: item.price,
        currency: item.currency,
        dietaryLabels: item.attributes.dietaryLabels,
        imageUrl: item.imageUrl,
        originalImageUrl: item.originalImageUrl,
        imageProvenance: item.imageProvenance,
      })),
    })),
    integrations: draft.integrations,
  });
}

export function fromRestaurantDraft(
  draft: RestaurantDraft,
): RestaurantSiteDraft {
  return restaurantSiteDraftSchema.parse({
    slug: draft.slug,
    name: draft.name,
    eyebrow: draft.eyebrow,
    description: draft.description,
    attributes: {
      cuisine: draft.cuisine,
      showMenuImages: draft.showMenuImages,
    },
    address: draft.address,
    phone: draft.phone,
    sourceUrl: draft.sourceUrl,
    heroImageUrl: draft.heroImageUrl,
    heroOriginalImageUrl: draft.heroOriginalImageUrl,
    heroImageProvenance: draft.heroImageProvenance,
    palette: draft.palette,
    autoEnhanceImages: draft.autoEnhanceImages,
    defaultLocale: draft.defaultLocale,
    translations: draft.translations.map((translation) => ({
      locale: translation.locale,
      attributes: {
        cuisine: translation.cuisine,
      },
      eyebrow: translation.eyebrow,
      description: translation.description,
      catalogSections: translation.menuSections.map((section) => ({
        name: section.name,
        description: section.description,
        items: section.items.map((item) => ({
          name: item.name,
          description: item.description,
          attributes: {
            dietaryLabels: item.dietaryLabels,
          },
        })),
      })),
      integrationLabels: translation.integrationLabels,
    })),
    catalogSections: draft.menuSections.map((section) => ({
      name: section.name,
      description: section.description,
      items: section.items.map((item) => ({
        name: item.name,
        description: item.description,
        price: item.price,
        currency: item.currency,
        attributes: {
          dietaryLabels: item.dietaryLabels,
        },
        imageUrl: item.imageUrl,
        originalImageUrl: item.originalImageUrl,
        imageProvenance: item.imageProvenance,
      })),
    })),
    integrations: draft.integrations,
  });
}

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 72);
}

// Price formatting is pure Intl and belongs to no vertical; it lives in the
// shared draft module so the renderer can reach it without importing a vertical.
export { formatPrice } from "@/lib/site-draft";

export function getRestaurantLocales(draft: RestaurantDraft): string[] {
  return [
    draft.defaultLocale,
    ...draft.translations.map((translation) => translation.locale),
  ];
}

export function localizeRestaurantDraft(
  draft: RestaurantDraft,
  locale: string,
): RestaurantDraft {
  if (locale === draft.defaultLocale) return draft;
  const translation = draft.translations.find(
    (candidate) => candidate.locale === locale,
  );
  if (!translation) return draft;

  return {
    ...draft,
    cuisine: translation.cuisine,
    eyebrow: translation.eyebrow,
    description: translation.description,
    menuSections: draft.menuSections.map((section, sectionIndex) => ({
      ...section,
      name: translation.menuSections[sectionIndex].name,
      description: translation.menuSections[sectionIndex].description,
      items: section.items.map((item, itemIndex) => ({
        ...item,
        name: translation.menuSections[sectionIndex].items[itemIndex].name,
        description:
          translation.menuSections[sectionIndex].items[itemIndex].description,
        dietaryLabels:
          translation.menuSections[sectionIndex].items[itemIndex].dietaryLabels,
      })),
    })),
    integrations: draft.integrations.map((integration, integrationIndex) => ({
      ...integration,
      label: translation.integrationLabels[integrationIndex],
    })),
  };
}
