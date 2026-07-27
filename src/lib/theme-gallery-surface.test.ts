import { describe, expect, it } from "bun:test";
import { FACTORY_BRAND } from "@/lib/brand";
import { restaurantThemeGallerySurface } from "@/lib/theme-gallery-surface";
import { restaurantMarketing } from "@/lib/verticals/restaurant/marketing";

describe("restaurant theme gallery surface", () => {
  it("keeps the factory identity on cornershop.dev", () => {
    expect(
      restaurantThemeGallerySurface("https://cornershop.dev"),
    ).toMatchObject({
      brand: FACTORY_BRAND,
      canonicalOrigin: "https://cornershop.dev",
      inverse: true,
      pricingHref: "/niche/restaurant#pricing",
    });
  });

  it("uses the restaurant storefront identity on restofront.com", () => {
    expect(
      restaurantThemeGallerySurface("https://restofront.com"),
    ).toMatchObject({
      brand: restaurantMarketing.brand,
      canonicalOrigin: "https://restofront.com",
      inverse: false,
      pricingHref: "/#pricing",
    });
  });

  it("fails closed to the factory identity for an unknown host", () => {
    expect(
      restaurantThemeGallerySurface("https://unregistered.example"),
    ).toMatchObject({
      brand: FACTORY_BRAND,
      canonicalOrigin: "https://cornershop.dev",
      inverse: true,
    });
  });
});
