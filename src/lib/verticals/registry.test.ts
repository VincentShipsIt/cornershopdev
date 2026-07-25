import { describe, expect, it } from "bun:test";
import { deterministicDraft } from "@/lib/ai/site-generation";
import { Vertical } from "@/generated/prisma/enums";
import {
  sampleRestaurant,
  sampleSiteDraft,
  toRestaurantDraft,
} from "@/lib/restaurant";
import { beautyConfig } from "@/lib/verticals/beauty/config";
import {
  listVerticalIds,
  resolveVerticalConfig,
} from "@/lib/verticals/registry";
import { restaurantConfig } from "@/lib/verticals/restaurant/config";

/**
 * Concrete configs are imported directly rather than pulled back out of the
 * registry: `resolveVerticalConfig` returns the variance-erased surface, so a
 * test that goes through it can only assert on the shared contract. Registry
 * lookup is covered on its own below; everything vertical-specific asserts
 * against the config it actually belongs to.
 */
describe("vertical registry", () => {
  it("uses the generated Prisma enum as its identifier source", () => {
    expect(listVerticalIds()).toEqual([Vertical.RESTAURANT, Vertical.BEAUTY]);
  });

  it("resolves every registered id back to the config that declares it", () => {
    for (const id of listVerticalIds()) {
      expect(resolveVerticalConfig(id).id).toBe(id);
    }
  });

  it("preserves the legacy restaurant draft through the compatibility shim", () => {
    expect(toRestaurantDraft(sampleSiteDraft)).toEqual(sampleRestaurant);
  });

  it("resolves restaurant templates through attributes", () => {
    expect(
      restaurantConfig.templates.resolve({
        cuisine: "Modern Italian",
        showMenuImages: false,
      }).id,
    ).toBe("warm");
  });

  it("resolves beauty templates by controlled service style", () => {
    expect(
      beautyConfig.templates.resolve({
        serviceStyle: "spa-luxe",
        showServiceImages: true,
      }).id,
    ).toBe("spa-luxe");
  });

  /**
   * Beauty is the only vertical that turns the on-page request form on: none of
   * its providers ships an embeddable widget, so without it a salon whose only
   * booking link is Booksy would have no on-page capture at all.
   */
  it("keeps the booking-request form vertical-scoped", () => {
    expect(
      beautyConfig.rendererCapabilities({
        serviceStyle: "barbershop",
        showServiceImages: false,
      }).showBookingRequestForm,
    ).toBe(true);
    expect(
      restaurantConfig.rendererCapabilities({
        cuisine: "Modern Italian",
        showMenuImages: false,
      }).showBookingRequestForm,
    ).toBe(false);
  });

  it("builds a vertical-neutral deterministic fallback", () => {
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
      restaurantConfig,
    );

    expect(draft.attributes).toEqual(restaurantConfig.attributeDefaults);
    expect(draft.catalogSections[0]?.name).toBe(
      restaurantConfig.vocabulary.catalog,
    );
    expect(draft.defaultLocale).toBe("fr");
  });

  /**
   * The same generic fallback, driven by a second vertical's config — this is
   * what proves `deterministicDraft` reads vocabulary and defaults off the
   * descriptor instead of knowing anything about restaurants.
   */
  it("builds the deterministic fallback for beauty from the same code path", () => {
    const draft = deterministicDraft(
      {
        source: "Atelier Coupe",
        sourceUrl: null,
        sourceLocale: "fr",
        name: "Atelier Coupe",
        description: "",
        address: "",
        phone: "",
        heroImageUrl: null,
        pageText: "Atelier Coupe",
        links: [],
      },
      beautyConfig,
    );

    expect(draft.attributes).toEqual(beautyConfig.attributeDefaults);
    expect(draft.catalogSections[0]?.name).toBe(beautyConfig.vocabulary.catalog);
  });
});
