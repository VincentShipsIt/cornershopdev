import { describe, expect, it } from "bun:test";
import {
  ANALYTICS_WINDOWS,
  analyticsEventInputSchema,
  buildAnalyticsWindowDto,
} from "@/lib/analytics-contract";

const event = {
  id: "5cd2b4dd-c6d5-4bfb-b453-2d12b349c27a",
  visitId: "aa508bd0-43a1-4559-88ff-127fcf981bab",
  type: "SITE_VIEW" as const,
};

describe("public analytics event contract", () => {
  it("accepts only browser-owned site views and CTA clicks", () => {
    expect(analyticsEventInputSchema.parse(event)).toEqual(event);
    expect(
      analyticsEventInputSchema.parse({ ...event, type: "CTA_CLICK" }),
    ).toEqual({ ...event, type: "CTA_CLICK" });
  });

  it("rejects server-owned lead creation", () => {
    expect(() =>
      analyticsEventInputSchema.parse({ ...event, type: "LEAD_CREATED" }),
    ).toThrow();
  });

  it("rejects unknown fields and malformed identifiers", () => {
    expect(() =>
      analyticsEventInputSchema.parse({
        ...event,
        referrer: "https://example.test/private?email=owner@example.test",
      }),
    ).toThrow();
    expect(() =>
      analyticsEventInputSchema.parse({ ...event, visitId: "visitor-1" }),
    ).toThrow();
  });
});

describe("analytics windows", () => {
  it("offers exactly the supported reporting windows", () => {
    expect(ANALYTICS_WINDOWS).toEqual([7, 30, 90]);
  });

  it("builds conversion rates from the same visit denominator", () => {
    expect(
      buildAnalyticsWindowDto({
        days: 30,
        visits: 20,
        ctaVisitors: 5,
        bookingLeads: 2,
      }),
    ).toEqual({
      days: 30,
      visits: 20,
      ctaVisitors: 5,
      bookingLeads: 2,
      ctaRate: 0.25,
      leadRate: 0.1,
    });
  });

  it("returns zero rates when there are no visits", () => {
    expect(
      buildAnalyticsWindowDto({
        days: 7,
        visits: 0,
        ctaVisitors: 3,
        bookingLeads: 1,
      }),
    ).toMatchObject({ ctaRate: 0, leadRate: 0 });
  });

  it("preserves rates above one when a visit creates multiple outcomes", () => {
    expect(
      buildAnalyticsWindowDto({
        days: 90,
        visits: 2,
        ctaVisitors: 4,
        bookingLeads: 3,
      }),
    ).toMatchObject({ ctaRate: 2, leadRate: 1.5 });
  });
});
