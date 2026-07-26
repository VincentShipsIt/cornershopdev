import "server-only";
import type {
  ImportStatus,
  SiteStatus,
  SubscriptionStatus,
  Vertical,
} from "@/generated/prisma/enums";
import { getDb } from "@/lib/db";

export type OperatorSiteRow = {
  id: string;
  slug: string;
  name: string;
  vertical: Vertical;
  status: SiteStatus;
  createdAt: Date;
  ownerCount: number;
  subscriptionStatus: SubscriptionStatus | null;
  latestImportStatus: ImportStatus | null;
  latestImportAt: Date | null;
  bookingRequestCount: number;
  newBookingRequestCount: number;
  verifiedDomain: string | null;
};

export type OperatorDashboardData = {
  totals: {
    sites: number;
    signedUpSites: number;
    activeSubscriptions: number;
    bookingRequests: number;
    newBookingRequests: number;
  };
  sites: OperatorSiteRow[];
};

/**
 * Read-only, intentionally bounded operator DTO. Contact details remain in
 * their owning records and are not projected into this broad platform view.
 */
export async function getOperatorDashboardData(): Promise<OperatorDashboardData> {
  const db = getDb();
  const [
    siteCount,
    signedUpSiteCount,
    activeSubscriptionCount,
    bookingRequestCount,
    newBookingRequestCount,
    sites,
  ] = await Promise.all([
    db.site.count(),
    db.site.count({
      where: {
        organization: { memberships: { some: {} } },
      },
    }),
    db.subscription.count({ where: { status: "ACTIVE" } }),
    db.bookingRequest.count(),
    db.bookingRequest.count({ where: { status: "NEW" } }),
    db.site.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        slug: true,
        name: true,
        vertical: true,
        status: true,
        createdAt: true,
        organization: {
          select: {
            _count: { select: { memberships: true } },
            subscriptions: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { status: true },
            },
          },
        },
        importJobs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true, createdAt: true },
        },
        _count: { select: { bookingRequests: true } },
        domains: {
          where: { verified: true },
          orderBy: { verifiedAt: "desc" },
          take: 1,
          select: { hostname: true },
        },
      },
    }),
  ]);
  const newBookingRequestsBySite = await db.bookingRequest.groupBy({
    by: ["siteId"],
    where: {
      status: "NEW",
      siteId: { in: sites.map((site) => site.id) },
    },
    _count: { _all: true },
  });
  const newBookingRequestCounts = new Map(
    newBookingRequestsBySite.map((row) => [row.siteId, row._count._all]),
  );

  return {
    totals: {
      sites: siteCount,
      signedUpSites: signedUpSiteCount,
      activeSubscriptions: activeSubscriptionCount,
      bookingRequests: bookingRequestCount,
      newBookingRequests: newBookingRequestCount,
    },
    sites: sites.map((site) => ({
      id: site.id,
      slug: site.slug,
      name: site.name,
      vertical: site.vertical,
      status: site.status,
      createdAt: site.createdAt,
      ownerCount: site.organization?._count.memberships ?? 0,
      subscriptionStatus: site.organization?.subscriptions[0]?.status ?? null,
      latestImportStatus: site.importJobs[0]?.status ?? null,
      latestImportAt: site.importJobs[0]?.createdAt ?? null,
      bookingRequestCount: site._count.bookingRequests,
      newBookingRequestCount: newBookingRequestCounts.get(site.id) ?? 0,
      verifiedDomain: site.domains[0]?.hostname ?? null,
    })),
  };
}
