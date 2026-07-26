/**
 * The structural view of a site draft that the shared renderer consumes.
 *
 * Every vertical's own draft type (`RestaurantSiteDraft` today) is structurally
 * assignable to this, because they all extend the same `baseSiteDraftCoreShape`.
 * It is written out by hand rather than inferred from `baseSiteDraftSchema` so the
 * renderer depends on one vertical-neutral module instead of reaching into a
 * vertical's schema file — and so the contract is explicit about the fact that the
 * renderer reads `attributes` only through the vertical config, never by key.
 */
export type SitePaletteView = {
  background: string;
  foreground: string;
  accent: string;
};

export const LEGACY_THEME_VERSION = "legacy-v1";

/**
 * The renderer identity pinned independently from the editable content.
 *
 * `selection` deliberately remains an open JSON-shaped record. Issue #19 will
 * add bounded automatic/manual selection metadata there without another
 * publish-schema migration, while `id` and `version` stay the stable contract
 * this renderer needs today.
 */
export type SiteThemeView = {
  id: string;
  version: string;
  selection: Record<string, unknown>;
};

export type SiteCatalogItemView = {
  name: string;
  description: string;
  price: number | null;
  currency: string;
  imageUrl: string | null;
  attributes: Record<string, unknown>;
};

export type SiteCatalogSectionView = {
  name: string;
  description: string;
  items: SiteCatalogItemView[];
};

export type SiteIntegrationView = {
  type: "booking" | "ordering" | "delivery" | "social";
  label: string;
  provider: string | null;
  url: string;
  /**
   * The owner's id inside the provider (an OpenTable `rid`, a Fresha venue).
   * Only meaningful for providers that publish an embeddable widget, and only
   * ever used after `ProviderEmbedDefinition.idPattern` has matched it.
   */
  venueId: string | null;
};

export type SiteTranslationView = {
  locale: string;
  eyebrow: string;
  description: string;
  attributes: Record<string, unknown>;
  catalogSections: Array<{
    name: string;
    description: string;
    items: Array<{
      name: string;
      description: string;
      attributes: Record<string, unknown>;
    }>;
  }>;
  integrationLabels: string[];
};

export type SiteDraftView = {
  slug: string;
  name: string;
  eyebrow: string;
  description: string;
  address: string;
  phone: string;
  sourceUrl: string | null;
  heroImageUrl: string | null;
  palette: SitePaletteView;
  defaultLocale: string;
  attributes: Record<string, unknown>;
  catalogSections: SiteCatalogSectionView[];
  integrations: SiteIntegrationView[];
  translations: SiteTranslationView[];
};

export function formatPrice(
  price: number | null,
  currency = "EUR",
  locale = "en",
): string {
  if (price === null) return "";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: price % 1 === 0 ? 0 : 2,
  }).format(price);
}

export function getSiteLocales(draft: SiteDraftView): string[] {
  return [
    draft.defaultLocale,
    ...draft.translations.map((translation) => translation.locale),
  ];
}

/**
 * Overlays a translation onto the default-locale draft. Structure — section and
 * item counts, integration order — always comes from the default locale; the
 * translation only supplies text, which is why everything is index-mapped.
 * `assertTranslationParity` guarantees those indices line up on any draft that
 * went through a vertical's schema, so the `??` fallbacks below only ever fire on
 * data that bypassed validation.
 *
 * Attributes merge rather than replace: a translation carries the localizable
 * subset (restaurant sends `cuisine`, not `showMenuImages`), so the default
 * locale's values must survive for the keys it does not mention.
 */
export function localizeSiteDraft(
  draft: SiteDraftView,
  locale: string,
): SiteDraftView {
  if (locale === draft.defaultLocale) return draft;
  const translation = draft.translations.find(
    (candidate) => candidate.locale === locale,
  );
  if (!translation) return draft;

  return {
    ...draft,
    attributes: { ...draft.attributes, ...translation.attributes },
    eyebrow: translation.eyebrow,
    description: translation.description,
    catalogSections: draft.catalogSections.map((section, sectionIndex) => {
      const translatedSection = translation.catalogSections[sectionIndex];
      if (!translatedSection) return section;
      return {
        ...section,
        name: translatedSection.name,
        description: translatedSection.description,
        items: section.items.map((item, itemIndex) => {
          const translatedItem = translatedSection.items[itemIndex];
          if (!translatedItem) return item;
          return {
            ...item,
            name: translatedItem.name,
            description: translatedItem.description,
            attributes: { ...item.attributes, ...translatedItem.attributes },
          };
        }),
      };
    }),
    integrations: draft.integrations.map((integration, integrationIndex) => ({
      ...integration,
      label:
        translation.integrationLabels[integrationIndex] ?? integration.label,
    })),
  };
}
