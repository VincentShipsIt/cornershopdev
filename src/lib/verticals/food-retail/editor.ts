import {
  foodRetailSiteDraftSchema,
  type FoodRetailSiteDraft,
} from "@/lib/verticals/food-retail/schema";

export const FOOD_RETAIL_NEW_LINK_LABEL = "Order online";

/**
 * Adds the canonical source text as an explicit temporary locale fallback.
 * This keeps a private draft structurally valid without pretending the text was
 * translated. The stale status is the publication gate until an owner edits and
 * reviews the localized copy.
 */
export function appendFoodRetailCategoryTranslations(
  input: FoodRetailSiteDraft,
): FoodRetailSiteDraft {
  const draft = structuredClone(input);
  const section = draft.catalogSections.at(-1);
  if (!section) throw new Error("Product category not found");

  draft.translations.forEach((translation) => {
    translation.catalogSections.push({
      name: section.name,
      description: section.description,
      items: [],
    });
    translation.status = "stale";
  });
  return draft;
}

export function appendFoodRetailItemTranslations(
  input: FoodRetailSiteDraft,
  sectionIndex: number,
): FoodRetailSiteDraft {
  const draft = structuredClone(input);
  const item = draft.catalogSections[sectionIndex]?.items.at(-1);
  if (!item) throw new Error("Product not found");

  draft.translations.forEach((translation) => {
    const translatedSection = translation.catalogSections[sectionIndex];
    if (!translatedSection) throw new Error("Translated category not found");
    translatedSection.items.push({
      name: item.name,
      description: item.description,
      attributes: {
        seasonalAvailability: item.attributes.seasonalAvailability,
        preorderNote: item.attributes.preorderNote,
        allergens: [...item.attributes.allergens],
      },
    });
    translation.status = "stale";
  });
  return draft;
}

export function appendFoodRetailIntegrationTranslations(
  input: FoodRetailSiteDraft,
): FoodRetailSiteDraft {
  const draft = structuredClone(input);
  const integration = draft.integrations.at(-1);
  if (!integration) throw new Error("Ordering link not found");

  draft.translations.forEach((translation) => {
    translation.integrationLabels.push(integration.label);
    translation.status = "stale";
  });
  return draft;
}

export function markFoodRetailTranslationsStale(
  input: FoodRetailSiteDraft,
): FoodRetailSiteDraft {
  return {
    ...input,
    translations: input.translations.map((translation) => ({
      ...translation,
      status: "stale" as const,
    })),
  };
}

export function updateFoodRetailTranslation(
  input: FoodRetailSiteDraft,
  locale: string,
  updater: (
    translation: FoodRetailSiteDraft["translations"][number],
  ) => void,
): FoodRetailSiteDraft {
  const draft = structuredClone(input);
  const translation = draft.translations.find(
    (candidate) => candidate.locale === locale,
  );
  if (!translation) throw new Error("Translation not found");
  updater(translation);
  translation.status = "draft";
  return draft;
}

export function markFoodRetailTranslationReviewed(
  input: FoodRetailSiteDraft,
  locale: string,
): FoodRetailSiteDraft {
  const draft = foodRetailSiteDraftSchema.parse(input);
  const translation = draft.translations.find(
    (candidate) => candidate.locale === locale,
  );
  if (!translation) throw new Error("Translation not found");
  translation.status = "current";
  return foodRetailSiteDraftSchema.parse(draft);
}

export function hasUnreviewedFoodRetailTranslations(draft: {
  translations: Array<{ status: "current" | "stale" | "draft" }>;
}): boolean {
  return draft.translations.some(
    (translation) => translation.status !== "current",
  );
}
