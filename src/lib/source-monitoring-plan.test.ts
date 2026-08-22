import { describe, expect, it } from "bun:test";
import {
  monitoringEntitlement,
  monitoringIdempotencyKey,
  nextMonitoringTime,
} from "@/lib/source-monitoring-plan";

const env = { STRIPE_PRICE_ID: "price_founding" };

describe("source monitoring plan cadence", () => {
  it("checks the founding plan monthly", () => {
    expect(
      monitoringEntitlement(
        {
          status: "ACTIVE",
          stripePriceId: "price_founding",
          siteStatus: "LIVE",
        },
        env,
      ),
    ).toEqual({ active: true, plan: "founding", cadenceDays: 30 });
  });

  it("stops paused, canceled, past-due, and unknown subscriptions", () => {
    for (const input of [
      {
        status: "CANCELED" as const,
        stripePriceId: "price_founding",
        siteStatus: "LIVE" as const,
      },
      {
        status: "PAST_DUE" as const,
        stripePriceId: "price_retired",
        siteStatus: "LIVE" as const,
      },
      {
        status: "ACTIVE" as const,
        stripePriceId: "price_founding",
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
