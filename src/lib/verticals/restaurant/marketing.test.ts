import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { beautyMarketing } from "@/lib/verticals/beauty/marketing";
import { foodRetailMarketing } from "@/lib/verticals/food-retail/marketing";
import { localServiceMarketing } from "@/lib/verticals/local-service/marketing";
import { restaurantMarketing } from "@/lib/verticals/restaurant/marketing";

/**
 * GTM audit + first-customer runbook: launch is one $49/month founding plan.
 * Headlining $25/$50 or generated food imagery as a paid extra is the
 * regression these assertions exist to catch.
 */
describe("Restofront founding offer", () => {
  it("sells only one $49/month founding plan", () => {
    expect(restaurantMarketing.hero.proofPoints).toContain("$49/month");
    expect(restaurantMarketing.hero.proofPoints.join(" ")).not.toContain("$25");

    expect(restaurantMarketing.pricing.plans).toHaveLength(1);
    const [plan] = restaurantMarketing.pricing.plans;
    expect(plan).toMatchObject({
      name: "Founding",
      price: "$49",
      cadence: "/month",
      featured: true,
    });
    expect(plan.features.join(" ")).not.toMatch(/AI-assisted|generated food/i);
    expect(
      plan.features.some((feature) => /booking|ordering/.test(feature)),
    ).toBe(true);
  });

  it("does not advertise generated food imagery as a paid differentiator", () => {
    const blob = JSON.stringify(restaurantMarketing);
    expect(blob).not.toMatch(/AI-assisted food imagery/i);
    expect(blob).not.toMatch(/generate missing editorial/i);
    expect(blob).not.toMatch(/complementary editorial images/i);
    expect(restaurantMarketing.imagery.copy.toLowerCase()).toMatch(
      /existing photography|source/,
    );
  });

  it("shares one founding price while keeping vertical feature lists scoped", () => {
    for (const marketing of [
      restaurantMarketing,
      beautyMarketing,
      foodRetailMarketing,
      localServiceMarketing,
    ]) {
      expect(marketing.pricing.plans).toHaveLength(1);
      expect(marketing.pricing.plans[0]?.price).toBe("$49");
      expect(marketing.pricing.copy).toContain("Local currency");
    }
    expect(beautyMarketing.pricing.plans[0]?.features).not.toEqual(
      restaurantMarketing.pricing.plans[0]?.features,
    );
  });

  it("checks out the founding plan against the single STRIPE_PRICE_ID", async () => {
    const [panel, checkoutRoute] = await Promise.all([
      readFile(
        new URL("../../../app/claim/[slug]/claim-panel.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../../../app/api/checkout/route.ts", import.meta.url),
        "utf8",
      ),
    ]);
    expect(panel).toContain('CLAIM_CHECKOUT_PLAN_ID = "founding"');
    expect(panel).toContain("restaurantMarketing.pricing.plans[0]");
    expect(panel).not.toContain("price: 25");
    expect(panel).not.toContain("price: 50");
    expect(panel).not.toContain("$25");
    expect(checkoutRoute).toContain("adaptive_pricing: { enabled: true }");
  });
});
