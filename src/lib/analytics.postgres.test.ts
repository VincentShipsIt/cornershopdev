import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  mock,
  test,
} from "bun:test";

mock.module("server-only", () => ({}));

const enabled = process.env.ANALYTICS_POSTGRES_TEST === "1";
const now = new Date("2026-07-26T12:00:00.000Z");
const primarySiteId = `analytics-test-${randomUUID()}`;
const secondarySiteId = `analytics-test-${randomUUID()}`;
const primaryRecentVisitId = randomUUID();
let db: ReturnType<typeof import("@/lib/db").getDb>;
let getSiteAnalyticsSummary: typeof import("@/lib/analytics").getSiteAnalyticsSummary;
let getPortfolioAnalytics: typeof import("@/lib/analytics").getPortfolioAnalytics;
let liveBookingRequestSource: string;

describe.skipIf(!enabled)("analytics PostgreSQL integration", () => {
  beforeAll(async () => {
    const analytics = await import("@/lib/analytics");
    const database = await import("@/lib/db");
    db = database.getDb();
    getSiteAnalyticsSummary = analytics.getSiteAnalyticsSummary;
    getPortfolioAnalytics = analytics.getPortfolioAnalytics;
    liveBookingRequestSource = analytics.LIVE_BOOKING_REQUEST_SOURCE;

    await db.site.createMany({
      data: [
        {
          id: primarySiteId,
          slug: `analytics-primary-${randomUUID()}`,
          name: "Analytics primary",
        },
        {
          id: secondarySiteId,
          slug: `analytics-secondary-${randomUUID()}`,
          name: "Analytics secondary",
        },
      ],
    });
    await db.analyticsEvent.createMany({
      data: [
        event(primarySiteId, "SITE_VIEW", daysBefore(1), primaryRecentVisitId),
        event(primarySiteId, "CTA_CLICK", daysBefore(1), primaryRecentVisitId),
        event(primarySiteId, "SITE_VIEW", daysBefore(20), randomUUID()),
        event(primarySiteId, "SITE_VIEW", daysBefore(60), randomUUID()),
        event(secondarySiteId, "SITE_VIEW", daysBefore(1), randomUUID()),
      ],
    });
    await db.bookingRequest.createMany({
      data: [
        {
          siteId: primarySiteId,
          name: "Primary lead",
          email: "primary@example.test",
          source: liveBookingRequestSource,
          createdAt: daysBefore(1),
        },
        {
          siteId: secondarySiteId,
          name: "Secondary lead",
          email: "secondary@example.test",
          source: liveBookingRequestSource,
          createdAt: daysBefore(1),
        },
      ],
    });
  });

  afterAll(async () => {
    await db.site.deleteMany({
      where: { id: { in: [primarySiteId, secondarySiteId] } },
    });
  });

  test("returns executable 7/30/90-day site windows", async () => {
    const summary = await getSiteAnalyticsSummary(primarySiteId, now);

    expect(summary.windows).toEqual([
      {
        days: 7,
        visits: 1,
        ctaVisitors: 1,
        bookingLeads: 1,
        ctaRate: 1,
        leadRate: 1,
      },
      {
        days: 30,
        visits: 2,
        ctaVisitors: 1,
        bookingLeads: 1,
        ctaRate: 0.5,
        leadRate: 0.5,
      },
      {
        days: 90,
        visits: 3,
        ctaVisitors: 1,
        bookingLeads: 1,
        ctaRate: 1 / 3,
        leadRate: 1 / 3,
      },
    ]);
  });

  test("returns portfolio windows and bounded per-site metrics", async () => {
    const portfolio = await getPortfolioAnalytics({
      displayedSiteIds: [primarySiteId],
      now,
    });

    expect(portfolio.summary.windows[0]).toMatchObject({
      days: 7,
      visits: 2,
      ctaVisitors: 1,
      bookingLeads: 2,
      ctaRate: 0.5,
      leadRate: 1,
    });
    expect(portfolio.displayedSites30d.get(primarySiteId)).toEqual({
      visits: 2,
      ctaVisitors: 1,
      bookingLeads: 1,
      ctaRate: 0.5,
      leadRate: 0.5,
    });
  });
});

function event(
  siteId: string,
  type: "SITE_VIEW" | "CTA_CLICK",
  occurredAt: Date,
  visitId: string,
) {
  return {
    id: randomUUID(),
    siteId,
    visitId,
    type,
    occurredAt,
  } as const;
}

function daysBefore(days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60_000);
}
