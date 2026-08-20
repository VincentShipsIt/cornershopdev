import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteRenderer } from "@/components/site-renderer";
import { deterministicDraft } from "@/lib/ai/site-generation";
import { localizeSiteDraft } from "@/lib/site-draft";
import { foodRetailConfig } from "@/lib/verticals/food-retail/config";
import { sampleFoodRetailDraft } from "@/lib/verticals/food-retail/fixtures";
import { foodRetailProviders } from "@/lib/verticals/food-retail/providers";
import { foodRetailSiteDraftSchema } from "@/lib/verticals/food-retail/schema";

describe("FOOD_RETAIL vertical", () => {
  it("keeps deterministic fallback content factual and empty", () => {
    const draft = deterministicDraft(
      {
        source: "Boulangerie du Coin",
        sourceUrl: null,
        sourceLocale: "fr",
        name: "Boulangerie du Coin",
        description: "",
        address: "",
        phone: "",
        heroImageUrl: null,
        pageText: "Boulangerie du Coin",
        links: [],
      },
      foodRetailConfig,
    );

    expect(draft.attributes).toEqual(
      foodRetailConfig.deterministicAttributes,
    );
    expect(draft.catalogSections).toEqual([
      {
        name: "Product ranges",
        description:
          "Product ranges details were not available for automatic structuring.",
        items: [],
      },
    ]);
    expect(draft.businessHours).toEqual([]);
    expect(draft.integrations).toEqual([]);
  });

  it("rejects allergen labels without attached source evidence", () => {
    const unsourced = structuredClone(sampleFoodRetailDraft);
    unsourced.catalogSections[0].items[0].attributes.allergenSourceUrl = null;

    expect(foodRetailSiteDraftSchema.safeParse(unsourced).success).toBe(false);
  });

  it("rejects restaurant booking links and unprovenanced product images", () => {
    const bookingDraft = structuredClone(sampleFoodRetailDraft);
    bookingDraft.integrations[0].type = "booking";
    expect(foodRetailSiteDraftSchema.safeParse(bookingDraft).success).toBe(
      false,
    );

    const imageDraft = structuredClone(sampleFoodRetailDraft);
    imageDraft.catalogSections[0].items[0].imageUrl =
      "https://example.com/product.jpg";
    imageDraft.catalogSections[0].items[0].imageProvenance = null;
    expect(foodRetailSiteDraftSchema.safeParse(imageDraft).success).toBe(false);
  });

  it("preserves allergen evidence while localizing customer-facing labels", () => {
    const localized = localizeSiteDraft(sampleFoodRetailDraft, "fr");
    const firstItem = localized.catalogSections[0].items[0];

    expect(localized.attributes.pickupDetails).toContain("Commandez");
    expect(firstItem.name).toBe("Pain au levain de campagne");
    expect(firstItem.attributes.allergens).toEqual(["gluten"]);
    expect(firstItem.attributes.allergenSourceUrl).toBe(
      "https://example.com/maison-levain/allergens",
    );
  });

  it("registers commerce links but never booking providers", () => {
    expect(foodRetailProviders.some((provider) => provider.type === "ordering"))
      .toBe(true);
    expect(foodRetailProviders.some((provider) => provider.type === "delivery"))
      .toBe(true);
    expect(foodRetailProviders.some((provider) => provider.type === "booking"))
      .toBe(false);
    expect(foodRetailConfig.prompt.extractionRules).toContain(
      "Do not create booking links",
    );
  });

  it("renders pickup and preorder conversion without reservations", () => {
    const html = renderToStaticMarkup(
      <SiteRenderer
        draft={sampleFoodRetailDraft}
        vertical="FOOD_RETAIL"
        locale="en"
      />,
    );

    expect(html).toContain("Preorder for pickup");
    expect(html).toContain("Order online for pickup");
    expect(html).toContain("Allergens: gluten");
    expect(html).toContain("Apricot season only");
    expect(html).not.toContain("Request a table");
    expect(html).not.toContain("Reservations");
    expect(html).not.toContain("booking-requests");
  });

  it("renders the sourced retail experience in French", () => {
    const html = renderToStaticMarkup(
      <SiteRenderer
        draft={localizeSiteDraft(sampleFoodRetailDraft, "fr")}
        vertical="FOOD_RETAIL"
        locale="fr"
      />,
    );

    expect(html).toContain("Commander pour retrait");
    expect(html).toContain("Retrait");
    expect(html).toContain("Allergènes: gluten");
    expect(html).toContain("Saison des abricots uniquement");
    expect(html).not.toContain("Réservations");
  });
});
