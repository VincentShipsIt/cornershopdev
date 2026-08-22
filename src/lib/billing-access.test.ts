import { describe, expect, it } from "bun:test";
import { evaluateBillingAccess } from "@/lib/billing-access";

const configuredPrice = "price_founding";

describe("paid feature access", () => {
  it("allows an active subscription on a configured price", () => {
    expect(
      evaluateBillingAccess(
        {
          status: "ACTIVE",
          stripePriceId: "price_founding",
          stripeCustomerId: "cus_1",
        },
        configuredPrice,
      ).ok,
    ).toBe(true);
  });

  it.each(["INCOMPLETE", "PAST_DUE", "CANCELED"] as const)(
    "blocks %s subscriptions",
    (status) => {
      const access = evaluateBillingAccess(
        {
          status,
          stripePriceId: "price_founding",
          stripeCustomerId: "cus_1",
        },
        configuredPrice,
      );
      expect(access.ok).toBe(false);
      if (!access.ok) expect(access.status).toBe(402);
    },
  );

  it("blocks missing and unconfigured-price subscriptions", () => {
    expect(evaluateBillingAccess(null, configuredPrice).ok).toBe(false);
    expect(
      evaluateBillingAccess(
        {
          status: "ACTIVE",
          stripePriceId: "price_attacker",
          stripeCustomerId: "cus_1",
        },
        configuredPrice,
      ).ok,
    ).toBe(false);
  });
});
