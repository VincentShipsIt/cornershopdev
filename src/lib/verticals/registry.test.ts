import { describe, expect, it } from "bun:test";
import { deterministicDraft } from "@/lib/ai/site-generation";
import { Vertical } from "@/generated/prisma/enums";
import {
  sampleRestaurant,
  sampleSiteDraft,
  toRestaurantDraft,
} from "@/lib/restaurant";
import {
  getVerticalConfig,
  listVerticalIds,
} from "@/lib/verticals/registry";

describe("vertical registry", () => {
  it("uses the generated Prisma enum as its identifier source", () => {
    expect(listVerticalIds()).toEqual([Vertical.RESTAURANT]);
    expect(getVerticalConfig(Vertical.RESTAURANT).id).toBe(
      Vertical.RESTAURANT,
    );
  });

  it("preserves the legacy restaurant draft through the compatibility shim", () => {
    expect(toRestaurantDraft(sampleSiteDraft)).toEqual(sampleRestaurant);
  });

  it("resolves restaurant templates through attributes", () => {
    const vertical = getVerticalConfig(Vertical.RESTAURANT);
    expect(
      vertical.templates.resolve({
        cuisine: "Modern Italian",
        showMenuImages: false,
      }).id,
    ).toBe("warm");
  });

  it("builds a vertical-neutral deterministic fallback", () => {
    const vertical = getVerticalConfig(Vertical.RESTAURANT);
    const draft = deterministicDraft(
      {
        source: "Café Roma",
        sourceUrl: null,
        sourceLocale: "fr",
        name: "Café Roma",
        description: "",
        address: "",
        phone: "",
        heroImageUrl: null,
        pageText: "Café Roma",
        links: [],
      },
      vertical,
    );

    expect(draft.attributes).toEqual(vertical.attributeDefaults);
    expect(draft.catalogSections[0]?.name).toBe(
      vertical.vocabulary.catalog,
    );
    expect(draft.defaultLocale).toBe("fr");
  });
});
