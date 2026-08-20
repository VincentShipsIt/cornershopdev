import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteRenderer } from "@/components/site-renderer";
import { buildFoodRetailJsonLd } from "@/lib/food-retail-json-ld";
import { foodRetailConfig } from "@/lib/verticals/food-retail/config";
import { sampleFoodRetailDraft } from "@/lib/verticals/food-retail/fixtures";
import {
  foodRetailItemAttributesSchema,
  foodRetailSiteDraftSchema,
} from "@/lib/verticals/food-retail/schema";

describe("FOOD_RETAIL stock truth", () => {
  it("defaults missing legacy stock evidence to unknown", () => {
    expect(foodRetailItemAttributesSchema.parse({})).toMatchObject({
      visible: true,
      stockSourceUrl: null,
    });
    expect(foodRetailConfig.itemAttributeDefaults).toMatchObject({
      visible: true,
      stockSourceUrl: null,
    });
  });

  it("rejects in-stock and out-of-stock claims without source evidence", () => {
    for (const available of [true, false]) {
      const draft = structuredClone(sampleFoodRetailDraft);
      draft.catalogSections[0].items[0].available = available;
      draft.catalogSections[0].items[0].attributes.stockSourceUrl = null;

      const result = foodRetailSiteDraftSchema.safeParse(draft);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toContainEqual(
          expect.objectContaining({
            message: "Stock availability claims require a source URL",
          }),
        );
      }
    }
  });

  it("drops model-proposed stock claims even when they include a plausible URL", () => {
    const normalized = foodRetailConfig.normalizeGeneratedItem?.({
      available: true,
      attributes: {
        ...foodRetailConfig.itemAttributeDefaults,
        stockSourceUrl: "https://example.com/invented-stock",
      },
    });

    expect(normalized).toMatchObject({
      available: null,
      attributes: { visible: true, stockSourceUrl: null },
    });
  });

  it("keeps an unknown-stock product visible without rendering a stock claim", () => {
    const draft = withOnlyStockStatus(null, null);
    const html = renderToStaticMarkup(
      <SiteRenderer draft={draft} vertical="FOOD_RETAIL" locale="en" />,
    );
    const jsonLd = firstOffer(buildFoodRetailJsonLd(draft));

    expect(html).toContain("Country sourdough");
    expect(html).not.toContain("In stock");
    expect(html).not.toContain("Out of stock");
    expect(jsonLd).not.toHaveProperty("availability");
  });

  it("uses availability-neutral catalog and gallery copy for unknown stock", () => {
    const cases = [
      { shopType: "bakery" as const, heading: "Explore the published range." },
      {
        shopType: "butcher" as const,
        heading: "Products from the published range.",
      },
      {
        shopType: "grocer" as const,
        heading: "What the shop publishes.",
      },
    ];
    const forbidden = [
      "Made for today",
      "Today’s selection",
      "on the counter",
      "prepared, ready",
      "current range",
      "Préparé pour aujourd’hui",
      "sélection du jour",
      "gamme actuelle",
    ];

    for (const testCase of cases) {
      const draft = withOnlyStockStatus(null, null);
      draft.attributes.shopType = testCase.shopType;
      draft.attributes.showProductImages = true;
      const html = renderToStaticMarkup(
        <SiteRenderer draft={draft} vertical="FOOD_RETAIL" locale="en" />,
      );
      expect(html).toContain(testCase.heading);
      for (const claim of forbidden) expect(html).not.toContain(claim);
    }
  });

  it("renders sourced in-stock and out-of-stock claims in HTML and JSON-LD", () => {
    const cases = [
      {
        available: true,
        label: "In stock",
        schemaValue: "https://schema.org/InStock",
      },
      {
        available: false,
        label: "Out of stock",
        schemaValue: "https://schema.org/OutOfStock",
      },
    ];

    for (const testCase of cases) {
      const draft = withOnlyStockStatus(
        testCase.available,
        "https://example.com/maison-levain/daily-breads",
      );
      const html = renderToStaticMarkup(
        <SiteRenderer draft={draft} vertical="FOOD_RETAIL" locale="en" />,
      );
      const jsonLd = firstOffer(buildFoodRetailJsonLd(draft));

      expect(html).toContain(testCase.label);
      expect(jsonLd).toHaveProperty("availability", testCase.schemaValue);
    }
  });
});

function withOnlyStockStatus(
  available: boolean | null,
  stockSourceUrl: string | null,
) {
  const draft = structuredClone(sampleFoodRetailDraft);
  const item = draft.catalogSections[0].items[0];
  item.available = available;
  item.attributes = {
    ...item.attributes,
    stockSourceUrl,
    seasonalAvailability: "",
    preorderRequired: null,
    preorderNote: "",
    allergens: [],
    allergenSourceUrl: null,
  };
  draft.catalogSections = [
    {
      ...draft.catalogSections[0],
      items: [item],
    },
  ];
  return draft;
}

function firstOffer(jsonLd: ReturnType<typeof buildFoodRetailJsonLd>) {
  const offer = jsonLd.hasOfferCatalog?.itemListElement[0]?.itemListElement[0];
  if (!offer) throw new Error("Expected the fixture to produce an offer");
  return offer;
}
