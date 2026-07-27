import { describe, expect, it } from "bun:test";
import {
  fromRestaurantDraft,
  restaurantDraftSchema,
  sampleRestaurant,
} from "@/lib/restaurant";
import {
  applyRegeneratedRestaurantTranslation,
  applyRestaurantMenuMutation,
  hasUnreviewedRestaurantTranslations,
  markRestaurantTranslationReviewed,
  updateRestaurantTranslation,
  validateRestaurantMenuDraft,
} from "@/lib/restaurant-menu-editor";

function multilingualDraft() {
  return restaurantDraftSchema.parse({
    ...sampleRestaurant,
    defaultLocale: "fr",
    translations: [
      {
        locale: "en",
        status: "current",
        cuisine: sampleRestaurant.cuisine,
        eyebrow: sampleRestaurant.eyebrow,
        description: sampleRestaurant.description,
        menuSections: sampleRestaurant.menuSections.map((section) => ({
          name: section.name,
          description: section.description,
          items: section.items.map((item) => ({
            name: item.name,
            description: item.description,
            dietaryLabels: item.dietaryLabels,
          })),
        })),
        integrationLabels: sampleRestaurant.integrations.map(
          (integration) => integration.label,
        ),
      },
    ],
  });
}

describe("restaurant menu CRUD", () => {
  it("keeps translated structure aligned while adding, deleting and reordering", () => {
    let draft = multilingualDraft();
    draft = applyRestaurantMenuMutation(draft, { type: "add-section" });
    draft = applyRestaurantMenuMutation(draft, {
      type: "add-item",
      sectionIndex: 2,
    });
    draft = applyRestaurantMenuMutation(draft, {
      type: "move-section",
      sectionIndex: 2,
      direction: -1,
    });
    draft = applyRestaurantMenuMutation(draft, {
      type: "delete-item",
      sectionIndex: 0,
      itemIndex: 0,
    });

    expect(restaurantDraftSchema.parse(draft)).toEqual(draft);
    expect(draft.translations[0].status).toBe("stale");
    expect(
      draft.translations[0].menuSections.map((section) => section.items.length),
    ).toEqual(draft.menuSections.map((section) => section.items.length));
  });

  it("blocks empty names, negative prices and unsupported currencies clearly", () => {
    let draft = multilingualDraft();
    draft = applyRestaurantMenuMutation(draft, {
      type: "update-item",
      sectionIndex: 0,
      itemIndex: 0,
      changes: {
        name: "",
        price: -1,
        currency: "ZZZ" as "EUR",
      },
    });
    const issues = validateRestaurantMenuDraft(draft);

    expect(issues.some((issue) => issue.path.endsWith(".name"))).toBe(true);
    expect(issues.some((issue) => issue.path.endsWith(".price"))).toBe(true);
    expect(issues.some((issue) => issue.path.endsWith(".currency"))).toBe(true);
  });

  it("regenerates text only and preserves canonical facts", () => {
    const draft = applyRestaurantMenuMutation(multilingualDraft(), {
      type: "update-item",
      sectionIndex: 0,
      itemIndex: 0,
      changes: {
        price: 12.5,
        currency: "GBP",
        available: false,
        imageUrl: "/approved/focaccia.webp",
        imageProvenance: "owner",
      },
    });
    const candidate = {
      cuisine: "Italian",
      eyebrow: "Seasonal neighbourhood kitchen",
      description:
        "An English draft prepared for owner review before it can be published.",
      menuSections: draft.menuSections.map((section) => ({
        name: `English ${section.name}`,
        description: section.description,
        items: section.items.map((item) => ({
          name: `English ${item.name}`,
          description: item.description,
          dietaryLabels: item.dietaryLabels,
        })),
      })),
      integrationLabels: draft.integrations.map(
        (integration) => integration.label,
      ),
    };
    const regenerated = applyRegeneratedRestaurantTranslation(
      draft,
      "en",
      candidate,
    );

    expect(regenerated.translations[0].status).toBe("draft");
    expect(regenerated.menuSections).toEqual(draft.menuSections);
    expect(fromRestaurantDraft(regenerated).catalogSections[0].items[0])
      .toMatchObject({
        price: 12.5,
        currency: "GBP",
        available: false,
        imageUrl: "/approved/focaccia.webp",
      });
    expect(
      () =>
        applyRegeneratedRestaurantTranslation(draft, "en", {
          ...candidate,
          menuSections: candidate.menuSections.slice(1),
        }),
    ).toThrow();
  });

  it("requires edited or regenerated translations to be reviewed", () => {
    const edited = updateRestaurantTranslation(
      multilingualDraft(),
      "en",
      (translation) => {
        translation.menuSections[0].name = "Starters";
      },
    );
    expect(hasUnreviewedRestaurantTranslations(edited)).toBe(true);
    const reviewed = markRestaurantTranslationReviewed(edited, "en");
    expect(hasUnreviewedRestaurantTranslations(reviewed)).toBe(false);
  });
});
