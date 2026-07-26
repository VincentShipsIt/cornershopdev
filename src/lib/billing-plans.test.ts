import { describe, expect, it } from "bun:test";
import {
  billingPlanForPrice,
  BillingConfigurationError,
  configuredBillingPlans,
} from "@/lib/billing-plans";

const configured = {
  STRIPE_STARTER_PRICE_ID: "price_starter",
  STRIPE_GROWTH_PRICE_ID: "price_growth",
};

describe("configuredBillingPlans", () => {
  it("creates a server-owned plan and price allowlist", () => {
    const plans = configuredBillingPlans(configured);
    expect(plans.starter.priceId).toBe("price_starter");
    expect(billingPlanForPrice("price_growth", plans)?.id).toBe("growth");
    expect(billingPlanForPrice("price_attacker", plans)).toBeNull();
  });

  it("fails closed when a price is missing or reused", () => {
    expect(() => configuredBillingPlans({})).toThrow(BillingConfigurationError);
    expect(() =>
      configuredBillingPlans({
        STRIPE_STARTER_PRICE_ID: "price_same",
        STRIPE_GROWTH_PRICE_ID: "price_same",
      }),
    ).toThrow("different Stripe prices");
  });
});
