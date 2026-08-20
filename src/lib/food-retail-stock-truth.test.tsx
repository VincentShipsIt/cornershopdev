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
      stockStatus: null,
      stockSourceUrl: null,
    });
    expect(foodRetailConfig.itemAttributeDefaults).toMatchObject({
      stockStatus: null,
      stockSourceUrl: null,
    });
  });

  it("rejects in-stock and out-of-stock claims without source evidence", () => {
    for (const stockStatus of ["in-stock", "out-of-stock"] as const) {
      const draft = structuredClone(sampleFoodRetailDraft);
      draft.catalogSections[0].items[0].attributes.stockStatus = stockStatus;
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

  it("renders sourced in-stock and out-of-stock claims in HTML and JSON-LD", () => {
    const cases = [
      {
        stockStatus: "in-stock" as const,
        label: "In stock",
        schemaValue: "https://schema.org/InStock",
      },
      {
        stockStatus: "out-of-stock" as const,
        label: "Out of stock",
        schemaValue: "https://schema.org/OutOfStock",
      },
    ];

    for (const testCase of cases) {
      const draft = withOnlyStockStatus(
        testCase.stockStatus,
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
  stockStatus: "in-stock" | "out-of-stock" | null,
  stockSourceUrl: string | null,
) {
  const draft = structuredClone(sampleFoodRetailDraft);
  const item = draft.catalogSections[0].items[0];
  item.attributes = {
    ...item.attributes,
    stockStatus,
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
