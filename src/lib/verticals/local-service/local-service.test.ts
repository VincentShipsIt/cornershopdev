import { describe, expect, it } from "bun:test";
import { localServiceConfig } from "@/lib/verticals/local-service/config";
import { sampleLocalServiceSiteDraft } from "@/lib/verticals/local-service/fixtures";
import {
  localServiceAttributesSchema,
  localServiceSiteDraftSchema,
} from "@/lib/verticals/local-service/schema";

describe("local-service vertical", () => {
  it("ships a complete fixture through the production draft schema", () => {
    expect(localServiceSiteDraftSchema.parse(sampleLocalServiceSiteDraft)).toEqual(
      sampleLocalServiceSiteDraft,
    );
    expect(sampleLocalServiceSiteDraft.attributes.tradeType).toBe("electrician");
    expect(sampleLocalServiceSiteDraft.integrations.map(({ type }) => type)).toEqual([
      "contact",
      "quote",
    ]);
  });

  it("bounds reusable trust, coverage and project fields", () => {
    expect(
      localServiceAttributesSchema.safeParse({
        ...localServiceConfig.attributeDefaults,
        serviceAreas: Array.from({ length: 25 }, (_, index) => `Area ${index}`),
      }).success,
    ).toBe(false);
    expect(
      localServiceAttributesSchema.safeParse({
        ...localServiceConfig.attributeDefaults,
        credentials: [{ name: "" }],
      }).success,
    ).toBe(false);
    expect(
      localServiceAttributesSchema.safeParse({
        ...localServiceConfig.attributeDefaults,
        projects: [{ title: "Claimed project", imageUrl: "javascript:alert(1)" }],
      }).success,
    ).toBe(false);
  });

  it("keeps availability, insurance and price posture unstated by default", () => {
    expect(localServiceConfig.attributeDefaults).toMatchObject({
      availabilityPosture: "not-stated",
      insuranceStatus: "not-stated",
      credentials: [],
      trustSignals: [],
      projects: [],
    });
    expect(localServiceConfig.itemAttributeDefaults).toEqual({
      pricingModel: "not-stated",
      priceUnit: "",
      emergencyEligible: false,
    });
  });

  it("classifies external quote and WhatsApp providers without embeds", () => {
    expect(
      localServiceConfig.providers.find(({ name }) => name === "WhatsApp"),
    ).toMatchObject({ type: "contact" });
    expect(
      localServiceConfig.providers.find(({ name }) => name === "Jobber"),
    ).toMatchObject({ type: "quote" });
    expect(localServiceConfig.providers.some(({ embed }) => embed)).toBe(false);
  });
});
