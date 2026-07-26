import { describe, expect, it } from "bun:test";
import { evaluateBillingAccess } from "@/lib/billing-access";

const configuredPrices = new Set(["price_starter", "price_growth"]);

describe("paid feature access", () => {
  it("allows an active subscription on a configured price", () => {
    expect(
      evaluateBillingAccess(
        {
          status: "ACTIVE",
          stripePriceId: "price_growth",
          stripeCustomerId: "cus_1",
        },
        configuredPrices,
      ).ok,
    ).toBe(true);
  });

  it.each(["INCOMPLETE", "PAST_DUE", "CANCELED"] as const)(
    "blocks %s subscriptions",
    (status) => {
      const access = evaluateBillingAccess(
        {
          status,
          stripePriceId: "price_growth",
          stripeCustomerId: "cus_1",
        },
        configuredPrices,
      );
      expect(access.ok).toBe(false);
      if (!access.ok) expect(access.status).toBe(402);
    },
  );

  it("blocks missing and unconfigured-price subscriptions", () => {
    expect(evaluateBillingAccess(null, configuredPrices).ok).toBe(false);
    expect(
      evaluateBillingAccess(
        {
          status: "ACTIVE",
          stripePriceId: "price_attacker",
          stripeCustomerId: "cus_1",
        },
        configuredPrices,
      ).ok,
    ).toBe(false);
  });
});
