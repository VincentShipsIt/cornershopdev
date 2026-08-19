import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { beautyMarketing } from "@/lib/verticals/beauty/marketing";
import { restaurantMarketing } from "@/lib/verticals/restaurant/marketing";

/**
 * GTM audit + first-customer runbook: launch is one €49/month founding plan.
 * Headlining $25/$50 or generated food imagery as a paid extra is the
 * regression these assertions exist to catch.
 */
describe("Restofront founding offer", () => {
  it("sells one €49/month founding plan, not $25 Starter or $50 Growth", () => {
    expect(restaurantMarketing.hero.proofPoints).toContain("€49/month");
    expect(restaurantMarketing.hero.proofPoints.join(" ")).not.toContain("$25");

    expect(restaurantMarketing.pricing.plans).toHaveLength(1);
    const [plan] = restaurantMarketing.pricing.plans;
    expect(plan).toMatchObject({
      name: "Founding",
      price: "€49",
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

  it("does not share the restaurant founding price with unlaunched beauty", () => {
    expect(beautyMarketing.hero.proofPoints).not.toEqual(
      restaurantMarketing.hero.proofPoints,
    );
    expect(beautyMarketing.pricing.plans).not.toEqual(
      restaurantMarketing.pricing.plans,
    );
  });

  it("checks out the founding plan against STRIPE_STARTER_PRICE_ID", async () => {
    const panel = await readFile(
      new URL("../../../app/claim/[slug]/claim-panel.tsx", import.meta.url),
      "utf8",
    );
    expect(panel).toContain('CLAIM_CHECKOUT_PLAN_ID = "starter"');
    expect(panel).toContain("restaurantMarketing.pricing.plans[0]");
    expect(panel).not.toContain('id: "growth"');
    expect(panel).not.toContain("price: 25");
    expect(panel).not.toContain("price: 50");
    expect(panel).not.toContain("$25");
  });
});
