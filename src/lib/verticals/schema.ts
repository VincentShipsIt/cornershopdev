import { z } from "zod";

/**
 * The draft primitives that belong to the engine rather than to any one vertical.
 *
 * These started life inside `restaurant/schema.ts` because restaurants were the
 * only vertical. A second vertical must be able to compose the same core shape —
 * a slug, a hero, a palette, a locale, priced catalog items, integration links,
 * translation parity — without importing them from a *sibling* vertical, which
 * would make every future vertical depend on the food one. So they live here and
 * `restaurant/schema.ts` re-exports them unchanged for its existing callers.
 *
 * The rule for what belongs here: if the field would read the same on a barber's
 * site as on a bistro's, it is engine. Anything that needs the trade's vocabulary
 * (cuisine, dietary labels, service style, duration) stays in the vertical.
 */

export const imageProvenanceSchema = z.enum([
  "official",
  "owner",
  "permissioned-ugc",
]);

/**
 * Either an absolute URL or a repo-relative path — the sample fixtures ship
 * local images, everything imported is absolute.
 */
export const siteImageUrlSchema = z.union([
  z.url(),
  z.string().regex(/^\/[a-zA-Z0-9/_\-.]+$/),
]);

export const supportedCurrencySchema = z.enum([
  "EUR",
  "USD",
  "GBP",
  "CHF",
  "CAD",
  "AUD",
  "NZD",
  "JPY",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
]);

export const catalogItemSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(320).default(""),
  price: z.number().nonnegative().nullable().default(null),
  currency: supportedCurrencySchema.default("EUR"),
  available: z.boolean().default(true),
  imageUrl: siteImageUrlSchema.nullable().default(null),
  originalImageUrl: siteImageUrlSchema.nullable().optional(),
  imageProvenance: imageProvenanceSchema.nullable().optional(),
  attributes: z.record(z.string(), z.unknown()).default({}),
});

export const catalogSectionSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(240).default(""),
  items: z.array(catalogItemSchema).max(40),
});

export const safeExternalHttpsUrlSchema = z.url().superRefine((value, context) => {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    context.addIssue({
      code: "custom",
      message: "Integration links must use HTTPS",
    });
  }
  if (url.username || url.password) {
    context.addIssue({
      code: "custom",
      message: "Integration links cannot contain credentials",
    });
  }
  if (url.port && url.port !== "443") {
    context.addIssue({
      code: "custom",
      message: "Integration links cannot use a custom port",
    });
  }
  if (isPrivateIntegrationHostname(url.hostname)) {
    context.addIssue({
      code: "custom",
      message: "Integration links must use a public hostname",
    });
  }
});

export const integrationSchema = z.object({
  type: z.enum(["booking", "ordering", "delivery", "social"]),
  label: z.string().trim().min(1).max(60),
  provider: z.string().trim().min(1).max(60).nullable().default(null),
  url: safeExternalHttpsUrlSchema,
  enabled: z.boolean().default(true),
  /**
   * The owner's id inside the provider, used to build an embedded booking
   * widget. Bounded here only for storage sanity — the value is never trusted
   * on its own: `resolveBookingEmbed` re-checks it against the provider's own
   * anchored `idPattern` before any frame is rendered.
   */
  venueId: z.string().max(120).nullable().default(null),
});

function isPrivateIntegrationHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const ipv6 = normalized.includes(":");
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    ipv6
  ) {
    return true;
  }

  const octets = normalized.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }
  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    octets[0] === 0 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

export const localeSchema = z
  .string()
  .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/, "Use a BCP 47 language code");

export const businessHoursSchema = z
  .array(
    z.object({
      days: z.string().trim().min(1).max(80),
      hours: z.string().trim().min(1).max(120),
    }),
  )
  .max(14)
  .default([]);

export const sourceDataSchema = z
  .object({
    navigation: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(60),
          url: z.url(),
        }),
      )
      .max(12)
      .default([]),
    brandAssets: z
      .array(
        z.object({
          type: z.enum(["logo", "favicon", "hero", "content"]),
          url: siteImageUrlSchema,
          sourceUrl: z.url(),
          provenance: z.literal("official"),
          evidence: z.enum(["json-ld", "meta", "html", "link", "css"]),
        }),
      )
      .max(24)
      .default([]),
    evidence: z
      .array(
        z.object({
          field: z.string().trim().min(1).max(80),
          value: z.string().max(500),
          sourceUrl: z.url(),
          method: z.enum(["json-ld", "meta", "html", "link", "css"]),
          excerpt: z.string().max(280),
        }),
      )
      .max(80)
      .default([]),
  })
  .default({ navigation: [], brandAssets: [], evidence: [] });

export const translatedCatalogItemSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(320).default(""),
  attributes: z.record(z.string(), z.unknown()).default({}),
});

export const translatedCatalogSectionSchema = z.object({
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

/**
 * Spread into each vertical's draft schema so the generic columns are declared
 * once. A vertical adds `attributes`, `translations` and `catalogSections` with
 * its own item/attribute schemas on top, then applies `assertTranslationParity`.
 */
export const baseSiteDraftCoreShape = {
  slug: z.string().min(2).max(80),
  name: z.string().min(2).max(120),
  eyebrow: z.string().max(100),
  description: z.string().min(20).max(500),
  address: z.string().max(220),
  phone: z.string().max(40),
  email: z.string().email().or(z.literal("")).default(""),
  sourceUrl: z.url().nullable(),
  logoUrl: siteImageUrlSchema.nullable().default(null),
  faviconUrl: siteImageUrlSchema.nullable().default(null),
  heroImageUrl: siteImageUrlSchema.nullable(),
  heroOriginalImageUrl: siteImageUrlSchema.nullable().optional(),
  heroImageProvenance: imageProvenanceSchema.nullable().optional(),
  palette: z.object({
    background: z.string(),
    foreground: z.string(),
    accent: z.string(),
    accentForeground: z.string().default("#ffffff"),
  }),
  sourceData: sourceDataSchema,
  autoEnhanceImages: z.boolean().default(true),
  defaultLocale: localeSchema.default("en"),
  businessHours: businessHoursSchema,
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

/**
 * The invariant every renderer relies on: a translation array is index-aligned
 * with the canonical draft, so `localizeSiteDraft` can zip them without lookups.
 *
 * `sectionFieldName`/`catalogName` only shape the error path and message, so the
 * legacy flat restaurant draft can report `menuSections` while the nested drafts
 * report `catalogSections`.
 */
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

export type SiteLocale = z.infer<typeof localeSchema>;
