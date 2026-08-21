import { describe, expect, it } from "bun:test";
import {
  billingPlanForPrice,
  BillingConfigurationError,
  configuredBillingPlans,
  configuredBillingPriceIds,
  stripeLivemodeForSecret,
  validateRestofrontFoundingPrice,
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

  it("grandfathers explicitly configured legacy prices for access only", () => {
    const prices = configuredBillingPriceIds({
      ...configured,
      STRIPE_LEGACY_PRICE_IDS: "price_old_starter, price_old_growth",
    });
    expect(prices).toEqual(
      new Set([
        "price_starter",
        "price_growth",
        "price_old_starter",
        "price_old_growth",
      ]),
    );
    expect(
      billingPlanForPrice(
        "price_old_starter",
        configuredBillingPlans(configured),
      ),
    ).toBeNull();
  });
});

describe("Restofront founding Stripe price", () => {
  const price = {
    id: "price_starter",
    active: true,
    currency: "eur",
    unit_amount: 4_900,
    type: "recurring",
    livemode: true,
    tax_behavior: "exclusive",
    recurring: {
      interval: "month",
      interval_count: 1,
      usage_type: "licensed",
    },
    product: { active: true },
  };

  it("accepts only the approved live €49 monthly exclusive-tax offer", () => {
    expect(() =>
      validateRestofrontFoundingPrice(price, {
        expectedPriceId: "price_starter",
        expectedLivemode: true,
      }),
    ).not.toThrow();
  });

  it("rejects wrong amount, mode, cadence, tax, or archived product", () => {
    for (const candidate of [
      { ...price, unit_amount: 4_999 },
      { ...price, livemode: false },
      { ...price, recurring: { ...price.recurring, interval: "year" } },
      { ...price, tax_behavior: "inclusive" },
      { ...price, product: { active: false } },
      { ...price, product: "prod_unexpanded" },
    ]) {
      expect(() =>
        validateRestofrontFoundingPrice(candidate, {
          expectedPriceId: "price_starter",
          expectedLivemode: true,
        }),
      ).toThrow(BillingConfigurationError);
    }
  });

  it("derives expected mode only from an explicit Stripe secret mode", () => {
    expect(stripeLivemodeForSecret("sk_live_example")).toBe(true);
    expect(stripeLivemodeForSecret("sk_test_example")).toBe(false);
    expect(() => stripeLivemodeForSecret("rk_live_example")).toThrow(
      BillingConfigurationError,
    );
  });
});
