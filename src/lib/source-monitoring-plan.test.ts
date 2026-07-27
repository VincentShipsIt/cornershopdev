import { describe, expect, it } from "bun:test";
import {
  monitoringEntitlement,
  monitoringIdempotencyKey,
  nextMonitoringTime,
} from "@/lib/source-monitoring-plan";

const env = {
  STRIPE_STARTER_PRICE_ID: "price_starter",
  STRIPE_GROWTH_PRICE_ID: "price_growth",
};

describe("source monitoring plan cadence", () => {
  it("checks Starter monthly and Growth weekly", () => {
    expect(
      monitoringEntitlement(
        {
          status: "ACTIVE",
          stripePriceId: "price_starter",
          siteStatus: "LIVE",
        },
        env,
      ),
    ).toEqual({ active: true, plan: "starter", cadenceDays: 30 });
    expect(
      monitoringEntitlement(
        {
          status: "ACTIVE",
          stripePriceId: "price_growth",
          siteStatus: "CLAIMED",
        },
        env,
      ),
    ).toEqual({ active: true, plan: "growth", cadenceDays: 7 });
  });

  it("stops paused, canceled, past-due, and unknown subscriptions", () => {
    for (const input of [
      {
        status: "CANCELED" as const,
        stripePriceId: "price_starter",
        siteStatus: "LIVE" as const,
      },
      {
        status: "PAST_DUE" as const,
        stripePriceId: "price_growth",
        siteStatus: "LIVE" as const,
      },
      {
        status: "ACTIVE" as const,
        stripePriceId: "price_starter",
        siteStatus: "PAUSED" as const,
      },
      {
        status: "ACTIVE" as const,
        stripePriceId: "price_retired",
        siteStatus: "LIVE" as const,
      },
    ]) {
      expect(monitoringEntitlement(input, env).active).toBe(false);
    }
  });

  it("advances from the durable scheduled time and skips missed intervals", () => {
    expect(
      nextMonitoringTime(
        new Date("2026-06-01T00:00:00.000Z"),
        7,
        new Date("2026-07-01T00:00:00.000Z"),
      ).toISOString(),
    ).toBe("2026-07-06T00:00:00.000Z");
    expect(
      monitoringIdempotencyKey(
        "site_1",
        new Date("2026-07-06T00:00:00.000Z"),
      ),
    ).toBe("site_1:2026-07-06T00:00:00.000Z");
  });
});
