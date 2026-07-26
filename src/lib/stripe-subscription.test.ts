import { describe, expect, it } from "bun:test";
import type Stripe from "stripe";
import {
  mapStripeSubscriptionStatus,
  stripeSubscriptionSnapshot,
} from "@/lib/stripe-subscription";

describe("Stripe subscription lifecycle mapping", () => {
  it.each([
    ["active", "ACTIVE"],
    ["trialing", "ACTIVE"],
    ["incomplete", "INCOMPLETE"],
    ["incomplete_expired", "INCOMPLETE"],
    ["past_due", "PAST_DUE"],
    ["unpaid", "PAST_DUE"],
    ["paused", "PAST_DUE"],
    ["canceled", "CANCELED"],
  ] as const)("maps %s to %s", (stripeStatus, localStatus) => {
    expect(mapStripeSubscriptionStatus(stripeStatus)).toBe(localStatus);
  });

  it("fails a future Stripe status closed until the mapping is updated", () => {
    expect(
      mapStripeSubscriptionStatus(
        "future_status" as Stripe.Subscription.Status,
      ),
    ).toBe("INCOMPLETE");
  });

  it("extracts the customer, configured price, period and cancellation state", () => {
    const snapshot = stripeSubscriptionSnapshot(
      subscription({
        status: "past_due",
        cancel_at_period_end: true,
      }),
    );
    expect(snapshot).toEqual({
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      stripePriceId: "price_growth",
      status: "PAST_DUE",
      currentPeriodEnd: new Date("2026-08-26T00:00:00.000Z"),
      cancelAtPeriodEnd: true,
    });
  });

  it("fails paid-feature price validation closed for multi-price subscriptions", () => {
    const value = subscription();
    value.items.data.push({
      ...value.items.data[0],
      id: "si_2",
      price: { ...value.items.data[0].price, id: "price_unconfigured" },
    });
    expect(stripeSubscriptionSnapshot(value).stripePriceId).toBeNull();
  });
});

function subscription(
  overrides: Partial<Stripe.Subscription> = {},
): Stripe.Subscription {
  return {
    id: "sub_1",
    customer: "cus_1",
    status: "active",
    cancel_at_period_end: false,
    items: {
      data: [
        {
          id: "si_1",
          current_period_end:
            new Date("2026-08-26T00:00:00.000Z").getTime() / 1000,
          price: { id: "price_growth" },
        },
      ],
    },
    ...overrides,
  } as Stripe.Subscription;
}
