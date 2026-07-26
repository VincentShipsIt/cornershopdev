import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import type { AnalyticsEventType } from "@/generated/prisma/enums";
import {
  ANALYTICS_WINDOWS,
  buildAnalyticsWindowDto,
  type AnalyticsEventInput,
  type AnalyticsSummaryDto,
  type SiteAnalyticsRowDto,
} from "@/lib/analytics-contract";
import {
  analyticsRequestHostname,
  resolveEligibleAnalyticsSite,
} from "@/lib/analytics-policy";
import { createIdempotentAnalyticsEvent } from "@/lib/analytics-idempotency";
import { analyticsRetentionCutoff } from "@/lib/analytics-retention";
import { getDb } from "@/lib/db";
import { isFactoryHostname } from "@/lib/hostnames";

export const LIVE_BOOKING_REQUEST_SOURCE = "live-site-form";

export type { AnalyticsSummaryDto, SiteAnalyticsRowDto };

type MetricRow = {
  days: number;
  visits: number;
  ctaVisitors: number;
  bookingLeads: number;
};

type SiteMetricRow = {
  siteId: string;
  visits: number;
  ctaVisitors: number;
};

type SiteLeadRow = {
  siteId: string;
  bookingLeads: number;
};

export async function resolveAnalyticsSiteForHeaders(headers: Headers) {
  const hostname = analyticsRequestHostname(headers);
  return resolveEligibleAnalyticsSite({
    hostname,
    isFactory: isFactoryHostname,
    lookup: async (verifiedHostname) => {
      const domain = await getDb().domain.findUnique({
        where: { hostname: verifiedHostname },
        select: {
          verified: true,
          site: { select: { id: true, slug: true } },
        },
      });
      if (!domain) return null;
      return {
        id: domain.site.id,
        slug: domain.site.slug,
        verified: domain.verified,
      };
    },
  });
}

export async function recordBrowserAnalyticsEvent(
  siteId: string,
  event: AnalyticsEventInput,
): Promise<"created" | "duplicate"> {
  return createAnalyticsEvent({
    id: event.id,
    visitId: event.visitId,
    type: event.type,
    siteId,
  });
}

export async function recordLeadCreatedEvent(input: {
  siteId: string;
  visitId: string;
}): Promise<"created" | "duplicate"> {
  return createAnalyticsEvent({
    id: randomUUID(),
    visitId: input.visitId,
    type: "LEAD_CREATED",
    siteId: input.siteId,
  });
}

async function createAnalyticsEvent(input: {
  id: string;
  visitId: string;
  type: AnalyticsEventType;
  siteId: string;
}): Promise<"created" | "duplicate"> {
  return createIdempotentAnalyticsEvent(() =>
    getDb().analyticsEvent.create({ data: input }),
  );
}

export async function getSiteAnalyticsSummary(
  siteId: string,
  now = new Date(),
): Promise<AnalyticsSummaryDto> {
  const rows = await getDb().$queryRaw<MetricRow[]>`
    WITH windows(days) AS (
      VALUES (7), (30), (90)
    )
    SELECT
      windows.days::int AS days,
      (
        SELECT COUNT(DISTINCT event."visitId")::int
        FROM "AnalyticsEvent" AS event
        WHERE event."siteId" = ${siteId}
          AND event."type" = 'SITE_VIEW'
          AND event."occurredAt" >= ${now} - windows.days * INTERVAL '1 day'
          AND event."occurredAt" < ${now}
      ) AS visits,
      (
        SELECT COUNT(DISTINCT event."visitId")::int
        FROM "AnalyticsEvent" AS event
        WHERE event."siteId" = ${siteId}
          AND event."type" = 'CTA_CLICK'
          AND event."occurredAt" >= ${now} - windows.days * INTERVAL '1 day'
          AND event."occurredAt" < ${now}
      ) AS "ctaVisitors",
      (
        SELECT COUNT(*)::int
        FROM "BookingRequest" AS lead
        WHERE lead."siteId" = ${siteId}
          AND lead."source" = ${LIVE_BOOKING_REQUEST_SOURCE}
          AND lead."createdAt" >= ${now} - windows.days * INTERVAL '1 day'
          AND lead."createdAt" < ${now}
      ) AS "bookingLeads"
    FROM windows
    ORDER BY windows.days ASC
  `;

  return analyticsSummary(rows, now);
}

export async function getPortfolioAnalytics(input: {
  displayedSiteIds: string[];
  now?: Date;
}): Promise<{
  summary: AnalyticsSummaryDto;
  displayedSites30d: Map<string, SiteAnalyticsRowDto>;
}> {
  const now = input.now ?? new Date();
  const cutoff30d = new Date(now.getTime() - 30 * 24 * 60 * 60_000);
  const db = getDb();
  const siteFilter =
    input.displayedSiteIds.length > 0
      ? Prisma.sql`AND event."siteId" IN (${Prisma.join(input.displayedSiteIds)})`
      : Prisma.sql`AND FALSE`;
  const leadSiteFilter =
    input.displayedSiteIds.length > 0
      ? Prisma.sql`AND lead."siteId" IN (${Prisma.join(input.displayedSiteIds)})`
      : Prisma.sql`AND FALSE`;

  const [summaryRows, siteRows, leadRows] = await Promise.all([
    db.$queryRaw<MetricRow[]>`
      WITH windows(days) AS (
        VALUES (7), (30), (90)
      )
      SELECT
        windows.days::int AS days,
        (
          SELECT COUNT(DISTINCT (event."siteId", event."visitId"))::int
          FROM "AnalyticsEvent" AS event
          WHERE event."type" = 'SITE_VIEW'
            AND event."occurredAt" >= ${now} - windows.days * INTERVAL '1 day'
            AND event."occurredAt" < ${now}
        ) AS visits,
        (
          SELECT COUNT(DISTINCT (event."siteId", event."visitId"))::int
          FROM "AnalyticsEvent" AS event
          WHERE event."type" = 'CTA_CLICK'
            AND event."occurredAt" >= ${now} - windows.days * INTERVAL '1 day'
            AND event."occurredAt" < ${now}
        ) AS "ctaVisitors",
        (
          SELECT COUNT(*)::int
          FROM "BookingRequest" AS lead
          WHERE lead."source" = ${LIVE_BOOKING_REQUEST_SOURCE}
            AND lead."createdAt" >= ${now} - windows.days * INTERVAL '1 day'
            AND lead."createdAt" < ${now}
        ) AS "bookingLeads"
      FROM windows
      ORDER BY windows.days ASC
    `,
    db.$queryRaw<SiteMetricRow[]>(Prisma.sql`
      SELECT
        event."siteId",
        COUNT(DISTINCT event."visitId")
          FILTER (WHERE event."type" = 'SITE_VIEW')::int AS visits,
        COUNT(DISTINCT event."visitId")
          FILTER (WHERE event."type" = 'CTA_CLICK')::int AS "ctaVisitors"
      FROM "AnalyticsEvent" AS event
      WHERE event."occurredAt" >= ${cutoff30d}
        AND event."occurredAt" < ${now}
        ${siteFilter}
      GROUP BY event."siteId"
    `),
    db.$queryRaw<SiteLeadRow[]>(Prisma.sql`
      SELECT
        lead."siteId",
        COUNT(*)::int AS "bookingLeads"
      FROM "BookingRequest" AS lead
      WHERE lead."source" = ${LIVE_BOOKING_REQUEST_SOURCE}
        AND lead."createdAt" >= ${cutoff30d}
        AND lead."createdAt" < ${now}
        ${leadSiteFilter}
      GROUP BY lead."siteId"
    `),
  ]);

  const counts = new Map<
    string,
    { visits: number; ctaVisitors: number; bookingLeads: number }
  >();
  for (const row of siteRows) {
    counts.set(row.siteId, {
      visits: row.visits,
      ctaVisitors: row.ctaVisitors,
      bookingLeads: 0,
    });
  }
  for (const row of leadRows) {
    const current = counts.get(row.siteId) ?? {
      visits: 0,
      ctaVisitors: 0,
      bookingLeads: 0,
    };
    current.bookingLeads = row.bookingLeads;
    counts.set(row.siteId, current);
  }

  return {
    summary: analyticsSummary(summaryRows, now),
    displayedSites30d: new Map(
      input.displayedSiteIds.map((siteId) => {
        const value = counts.get(siteId) ?? {
          visits: 0,
          ctaVisitors: 0,
          bookingLeads: 0,
        };
        const dto = buildAnalyticsWindowDto({ days: 30, ...value });
        return [
          siteId,
          {
            visits: dto.visits,
            ctaVisitors: dto.ctaVisitors,
            bookingLeads: dto.bookingLeads,
            ctaRate: dto.ctaRate,
            leadRate: dto.leadRate,
          },
        ];
      }),
    ),
  };
}

export async function pruneExpiredAnalytics(now = new Date()): Promise<number> {
  return getDb().$transaction(async (transaction) => {
    const [lock] = await transaction.$queryRaw<Array<{ acquired: boolean }>>`
      SELECT pg_try_advisory_xact_lock(1129333061) AS acquired
    `;
    if (!lock?.acquired) return 0;
    const deleted = await transaction.analyticsEvent.deleteMany({
      where: { occurredAt: { lt: analyticsRetentionCutoff(now) } },
    });
    return deleted.count;
  });
}

function analyticsSummary(
  rows: MetricRow[],
  now: Date,
): AnalyticsSummaryDto {
  const byDays = new Map(rows.map((row) => [row.days, row]));
  return {
    generatedAt: now.toISOString(),
    windows: ANALYTICS_WINDOWS.map((days) => {
      const row = byDays.get(days);
      return buildAnalyticsWindowDto({
        days,
        visits: row?.visits ?? 0,
        ctaVisitors: row?.ctaVisitors ?? 0,
        bookingLeads: row?.bookingLeads ?? 0,
      });
    }),
  };
}
