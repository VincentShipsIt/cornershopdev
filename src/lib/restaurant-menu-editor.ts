import type {
  RestaurantDraft,
  RestaurantTranslation,
} from "@/lib/verticals/restaurant/schema";
import {
  restaurantDraftSchema,
  restaurantTranslationCandidateSchema,
} from "@/lib/verticals/restaurant/schema";
import { supportedCurrencySchema } from "@/lib/verticals/schema";

export const SUPPORTED_MENU_CURRENCIES = supportedCurrencySchema.options;

export type RestaurantMenuMutation =
  | { type: "add-section" }
  | { type: "update-section"; sectionIndex: number; name?: string; description?: string }
  | { type: "delete-section"; sectionIndex: number }
  | { type: "move-section"; sectionIndex: number; direction: -1 | 1 }
  | { type: "add-item"; sectionIndex: number }
  | {
      type: "update-item";
      sectionIndex: number;
      itemIndex: number;
      changes: Partial<RestaurantDraft["menuSections"][number]["items"][number]>;
    }
  | { type: "delete-item"; sectionIndex: number; itemIndex: number }
  | {
      type: "move-item";
      sectionIndex: number;
      itemIndex: number;
      direction: -1 | 1;
    };

export type MenuValidationIssue = {
  path: string;
  message: string;
};

export function applyRestaurantMenuMutation(
  input: RestaurantDraft,
  mutation: RestaurantMenuMutation,
): RestaurantDraft {
  const draft = structuredClone(input);
  const translations = draft.translations;

  switch (mutation.type) {
    case "add-section": {
      draft.menuSections.push({
        name: "New section",
        description: "",
        items: [],
      });
      for (const translation of translations) {
        translation.menuSections.push({
          name: "New section",
          description: "",
          items: [],
        });
      }
      break;
    }
    case "update-section": {
      const section = requireSection(draft, mutation.sectionIndex);
      if (mutation.name !== undefined) section.name = mutation.name;
      if (mutation.description !== undefined) {
        section.description = mutation.description;
      }
      break;
    }
    case "delete-section": {
      if (draft.menuSections.length === 1) {
        throw new Error("A menu must keep at least one section");
      }
      requireSection(draft, mutation.sectionIndex);
      draft.menuSections.splice(mutation.sectionIndex, 1);
      for (const translation of translations) {
        translation.menuSections.splice(mutation.sectionIndex, 1);
      }
      break;
    }
    case "move-section": {
      const targetIndex = mutation.sectionIndex + mutation.direction;
      requireSection(draft, mutation.sectionIndex);
      requireSection(draft, targetIndex);
      move(draft.menuSections, mutation.sectionIndex, targetIndex);
      for (const translation of translations) {
        move(translation.menuSections, mutation.sectionIndex, targetIndex);
      }
      break;
    }
    case "add-item": {
      const section = requireSection(draft, mutation.sectionIndex);
      const item = {
        name: "New item",
        description: "",
        price: null,
        currency: "EUR" as const,
        available: true,
        dietaryLabels: [],
        imageUrl: null,
      };
      section.items.push(item);
      for (const translation of translations) {
        translation.menuSections[mutation.sectionIndex].items.push({
          name: item.name,
          description: item.description,
          dietaryLabels: [],
        });
      }
      break;
    }
    case "update-item": {
      const item = requireItem(
        draft,
        mutation.sectionIndex,
        mutation.itemIndex,
      );
      Object.assign(item, mutation.changes);
      break;
    }
    case "delete-item": {
      const section = requireSection(draft, mutation.sectionIndex);
      requireItem(draft, mutation.sectionIndex, mutation.itemIndex);
      section.items.splice(mutation.itemIndex, 1);
      for (const translation of translations) {
        translation.menuSections[mutation.sectionIndex].items.splice(
          mutation.itemIndex,
          1,
        );
      }
      break;
    }
    case "move-item": {
      const section = requireSection(draft, mutation.sectionIndex);
      const targetIndex = mutation.itemIndex + mutation.direction;
      requireItem(draft, mutation.sectionIndex, mutation.itemIndex);
      requireItem(draft, mutation.sectionIndex, targetIndex);
      move(section.items, mutation.itemIndex, targetIndex);
      for (const translation of translations) {
        move(
          translation.menuSections[mutation.sectionIndex].items,
          mutation.itemIndex,
          targetIndex,
        );
      }
      break;
    }
  }

  return markRestaurantTranslationsStale(draft);
}

export function updateRestaurantTranslation(
  input: RestaurantDraft,
  locale: string,
  updater: (translation: RestaurantTranslation) => void,
): RestaurantDraft {
  const draft = structuredClone(input);
  const translation = draft.translations.find(
    (candidate) => candidate.locale === locale,
  );
  if (!translation) throw new Error("Translation not found");
  updater(translation);
  translation.status = "draft";
  return draft;
}

export function markRestaurantTranslationReviewed(
  input: RestaurantDraft,
  locale: string,
): RestaurantDraft {
  const draft = structuredClone(input);
  const translation = draft.translations.find(
    (candidate) => candidate.locale === locale,
  );
  if (!translation) throw new Error("Translation not found");
  const parsed = restaurantDraftSchema.parse(draft);
  const parsedTranslation = parsed.translations.find(
    (candidate) => candidate.locale === locale,
  );
  if (!parsedTranslation) throw new Error("Translation not found");
  parsedTranslation.status = "current";
  return parsed;
}

export function applyRegeneratedRestaurantTranslation(
  input: RestaurantDraft,
  locale: string,
  candidate: unknown,
): RestaurantDraft {
  const generated = restaurantTranslationCandidateSchema.parse(candidate);
  const draft = structuredClone(input);
  const translationIndex = draft.translations.findIndex(
    (translation) => translation.locale === locale,
  );
  if (translationIndex < 0) throw new Error("Translation not found");
  draft.translations[translationIndex] = {
    ...generated,
    locale,
    status: "draft",
  };
  // The whole draft parse is the structural firewall: generated text cannot
  // add/remove/reorder items or sections because parity must still match the
  // canonical menu. Prices and availability do not exist in the candidate
  // schema, so regeneration cannot mutate those facts at all.
  return restaurantDraftSchema.parse(draft);
}

export function markRestaurantTranslationsStale(
  draft: RestaurantDraft,
): RestaurantDraft {
  return {
    ...draft,
    translations: draft.translations.map((translation) => ({
      ...translation,
      status: "stale" as const,
    })),
  };
}

export function hasUnreviewedRestaurantTranslations(
  draft: {
    translations: Array<{ status: "current" | "stale" | "draft" }>;
  },
): boolean {
  return draft.translations.some(
    (translation) => translation.status !== "current",
  );
}

export function validateRestaurantMenuDraft(
  draft: RestaurantDraft,
): MenuValidationIssue[] {
  const parsed = restaurantDraftSchema.safeParse(draft);
  if (parsed.success) return [];
  return parsed.error.issues
    .filter(
      (issue) =>
        issue.path[0] === "menuSections" ||
        issue.path[0] === "translations",
    )
    .map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
}

function requireSection(draft: RestaurantDraft, sectionIndex: number) {
  const section = draft.menuSections[sectionIndex];
  if (!section) throw new Error("Menu section not found");
  return section;
}

function requireItem(
  draft: RestaurantDraft,
  sectionIndex: number,
  itemIndex: number,
) {
  const item = requireSection(draft, sectionIndex).items[itemIndex];
  if (!item) throw new Error("Menu item not found");
  return item;
}

function move<T>(items: T[], from: number, to: number): void {
  const [item] = items.splice(from, 1);
  if (item === undefined) throw new Error("Menu entry not found");
  items.splice(to, 0, item);
}
