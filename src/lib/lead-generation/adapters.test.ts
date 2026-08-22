import { describe, expect, it } from "bun:test";
import { Vertical } from "@/generated/prisma/enums";
import { foodRetailLeadDiscovery } from "@/lib/lead-generation/food-retail";
import { localServiceLeadDiscovery } from "@/lib/lead-generation/local-service";
import { listOutreachVerticals } from "@/lib/lead-generation/registry";

describe("incoming SMB lead discovery adapters", () => {
  it("enables reviewed outreach for every registered SMB vertical", () => {
    expect(listOutreachVerticals()).toEqual([
      Vertical.RESTAURANT,
      Vertical.LOCAL_SERVICE,
      Vertical.FOOD_RETAIL,
    ]);
  });

  it("models food retailers as product-and-pickup storefronts", () => {
    expect(foodRetailLeadDiscovery.placeSearch.googleQuery("Valletta")).toBe(
      "bakeries, pastry shops, butchers, delis, cheesemongers and grocers in Valletta",
    );
    expect(foodRetailLeadDiscovery.placeSearch.googleIncludedType).toBeNull();
    expect(
      foodRetailLeadDiscovery.eligibility.categoryPattern.test("bakery"),
    ).toBe(true);
    expect(
      foodRetailLeadDiscovery.homepage.catalogPattern.test(
        '<a href="/products">Today’s breads and pastries</a>',
      ),
    ).toBe(true);
    expect(
      foodRetailLeadDiscovery.homepage.conversionPattern.test(
        "Pre-order for click and collect",
      ),
    ).toBe(true);
    expect(
      foodRetailLeadDiscovery.homepage.structuredDataTypes.test("Bakery"),
    ).toBe(true);
    expect(
      foodRetailLeadDiscovery.homepage.conversionPattern.test(
        "Reserve a restaurant table",
      ),
    ).toBe(false);
  });

  it("models local trades around services, evidence, and quote/contact paths", () => {
    expect(localServiceLeadDiscovery.placeSearch.googleQuery("Valletta")).toBe(
      "plumbers, electricians, builders, repair services and artisans in Valletta",
    );
    expect(localServiceLeadDiscovery.placeSearch.googleIncludedType).toBeNull();
    expect(
      localServiceLeadDiscovery.eligibility.categoryPattern.test("electrician"),
    ).toBe(true);
    expect(
      localServiceLeadDiscovery.homepage.catalogPattern.test(
        '<a href="/services">Electrical repairs and maintenance</a>',
      ),
    ).toBe(true);
    expect(
      localServiceLeadDiscovery.homepage.conversionPattern.test(
        "Request a quote on WhatsApp",
      ),
    ).toBe(true);
    expect(
      localServiceLeadDiscovery.homepage.structuredDataTypes.test("Plumber"),
    ).toBe(true);
    expect(
      localServiceLeadDiscovery.homepage.catalogPattern.test(
        "Dinner menu and table reservations",
      ),
    ).toBe(false);
  });
});
