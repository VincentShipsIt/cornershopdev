import "server-only";
import type {
  ImportStatus,
  SiteStatus,
  SubscriptionStatus,
  Vertical,
} from "@/generated/prisma/enums";
import {
  buildOperatorLeadRollup,
  getOperatorInvitationState,
  isOperatorReviewCurrent,
  type OperatorInvitationState,
  type OperatorLeadStageRollup,
} from "@/lib/operator-lead-status";
import {
  getPortfolioAnalytics,
  type AnalyticsSummaryDto,
  type SiteAnalyticsRowDto,
} from "@/lib/analytics";
import { getDb } from "@/lib/db";
import {
  compareOperatorSitesByDiscoveryScore,
  toOperatorLeadDiscoveryView,
  toOperatorLocalSeoAuditView,
  type OperatorLeadDiscoveryView,
  type OperatorLocalSeoAuditView,
} from "@/lib/operator-lead-attributes";

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
  latestImportError: string | null;
  bookingRequestCount: number;
  pendingBookingRequestCount: number;
  verifiedDomain: string | null;
  domainCount: number;
  verifiedDomainCount: number;
  tlsReadiness: "NOT_CONFIGURED" | "WAITING_FOR_DNS" | "AUTHORIZED";
  invitation: {
    id: string;
    email: string;
    state: OperatorInvitationState;
    expiresAt: Date;
    createdAt: Date;
  } | null;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  notes: Array<{
    id: string;
    note: string;
    actor: string | null;
    createdAt: Date;
  }>;
  contentReview: {
    missingFields: string[];
    heroImage: "missing" | "provenance_missing" | "provenance_recorded";
    translationCount: number;
    integrationCount: number;
    catalogItemCount: number;
  };
  isPublished: boolean;
  blockers: OperatorLeadStageRollup[];
  analytics30d: SiteAnalyticsRowDto;
  pendingSourceSuggestionCount: number;
  sourceMonitorLastSuccessAt: Date | null;
  discovery: OperatorLeadDiscoveryView | null;
  localSeoAudit: OperatorLocalSeoAuditView | null;
};

export type OperatorDashboardData = {
  totals: {
    sites: number;
    signedUpSites: number;
    activeSubscriptions: number;
    bookingRequests: number;
    pendingBookingRequests: number;
  };
  analytics: AnalyticsSummaryDto;
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
    pendingBookingRequestCount,
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
    db.bookingRequest.count({
      where: { status: { in: ["NEW", "NOTIFIED"] } },
    }),
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
        updatedAt: true,
        description: true,
        address: true,
        phone: true,
        sourceUrl: true,
        heroImageUrl: true,
        heroImageProvenance: true,
        defaultLocale: true,
        translations: true,
        publishedSiteVersionId: true,
        attributes: true,
        organization: {
          select: {
            _count: { select: { memberships: true } },
          },
        },
        subscription: { select: { status: true } },
        importJobs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true, createdAt: true, error: true },
        },
        _count: {
          select: {
            bookingRequests: true,
            integrations: true,
            sourceMonitorSuggestions: {
              where: { status: "PENDING" },
            },
          },
        },
        catalogSections: {
          select: { _count: { select: { items: true } } },
        },
        sourceMonitorState: {
          select: { lastSuccessAt: true },
        },
        domains: {
          orderBy: [{ verified: "desc" }, { verifiedAt: "desc" }],
          select: { hostname: true, verified: true },
        },
        claimInvitations: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            email: true,
            expiresAt: true,
            verifiedAt: true,
            acceptedAt: true,
            revokedAt: true,
            checkoutSessionId: true,
            createdAt: true,
          },
        },
        auditEvents: {
          where: {
            type: { in: ["operator.note.created", "site.review.completed"] },
          },
          orderBy: { createdAt: "desc" },
          take: 12,
          select: {
            id: true,
            type: true,
            actor: true,
            metadata: true,
            createdAt: true,
          },
        },
      },
    }),
  ]);
  const [pendingBookingRequestsBySite, analytics] = await Promise.all([
    db.bookingRequest.groupBy({
      by: ["siteId"],
      where: {
        status: { in: ["NEW", "NOTIFIED"] },
        siteId: { in: sites.map((site) => site.id) },
      },
      _count: { _all: true },
    }),
    getPortfolioAnalytics({
      displayedSiteIds: sites.map((site) => site.id),
    }),
  ]);
  const pendingBookingRequestCounts = new Map(
    pendingBookingRequestsBySite.map((row) => [row.siteId, row._count._all]),
  );

  return {
    totals: {
      sites: siteCount,
      signedUpSites: signedUpSiteCount,
      activeSubscriptions: activeSubscriptionCount,
      bookingRequests: bookingRequestCount,
      pendingBookingRequests: pendingBookingRequestCount,
    },
    analytics: analytics.summary,
    sites: sites.map((site) => {
      const ownerCount = site.organization?._count.memberships ?? 0;
      const invitationRecord = site.claimInvitations[0] ?? null;
      const invitationState = getOperatorInvitationState(invitationRecord);
      const latestReviewEvent = site.auditEvents.find(
        (event) => event.type === "site.review.completed",
      );
      const reviewEvent =
        latestReviewEvent &&
        isOperatorReviewCurrent(latestReviewEvent.createdAt, site.updatedAt)
          ? latestReviewEvent
          : undefined;
      const notes = site.auditEvents.flatMap((event) => {
        if (event.type !== "operator.note.created") return [];
        const note = metadataString(event.metadata, "note");
        return note
          ? [
              {
                id: event.id,
                note,
                actor: event.actor,
                createdAt: event.createdAt,
              },
            ]
          : [];
      });
      const verifiedDomainCount = site.domains.filter(
        (domain) => domain.verified,
      ).length;
      const contentReview = {
        missingFields: [
          !site.name.trim() ? "name" : null,
          !site.description?.trim() ? "description" : null,
          !site.address?.trim() ? "address" : null,
          !site.phone?.trim() ? "phone" : null,
          !site.sourceUrl?.trim() ? "source URL" : null,
        ].filter((value): value is string => Boolean(value)),
        heroImage: !site.heroImageUrl
          ? ("missing" as const)
          : site.heroImageProvenance
            ? ("provenance_recorded" as const)
            : ("provenance_missing" as const),
        translationCount: jsonArrayLength(site.translations),
        integrationCount: site._count.integrations,
        catalogItemCount: site.catalogSections.reduce(
          (sum, section) => sum + section._count.items,
          0,
        ),
      };
      const blockers = buildOperatorLeadRollup({
        importStatus: site.importJobs[0]?.status ?? null,
        reviewedAt: reviewEvent?.createdAt ?? null,
        ownerCount,
        invitationState,
        subscriptionStatus: site.subscription?.status ?? null,
        domainCount: site.domains.length,
        verifiedDomainCount,
        isPublished:
          Boolean(site.publishedSiteVersionId) && site.status === "LIVE",
      });

      return {
        id: site.id,
        slug: site.slug,
        name: site.name,
        vertical: site.vertical,
        status: site.status,
        createdAt: site.createdAt,
        ownerCount,
        subscriptionStatus: site.subscription?.status ?? null,
        latestImportStatus: site.importJobs[0]?.status ?? null,
        latestImportAt: site.importJobs[0]?.createdAt ?? null,
        latestImportError: site.importJobs[0]?.error ?? null,
        bookingRequestCount: site._count.bookingRequests,
        pendingBookingRequestCount:
          pendingBookingRequestCounts.get(site.id) ?? 0,
        verifiedDomain:
          site.domains.find((domain) => domain.verified)?.hostname ?? null,
        domainCount: site.domains.length,
        verifiedDomainCount,
        tlsReadiness:
          verifiedDomainCount > 0
            ? ("AUTHORIZED" as const)
            : site.domains.length > 0
              ? ("WAITING_FOR_DNS" as const)
              : ("NOT_CONFIGURED" as const),
        invitation: invitationRecord
          ? {
              id: invitationRecord.id,
              email: invitationRecord.email,
              state: invitationState,
              expiresAt: invitationRecord.expiresAt,
              createdAt: invitationRecord.createdAt,
            }
          : null,
        reviewedAt: reviewEvent?.createdAt ?? null,
        reviewedBy: reviewEvent?.actor ?? null,
        notes,
        contentReview,
        isPublished:
          Boolean(site.publishedSiteVersionId) && site.status === "LIVE",
        blockers,
        analytics30d: analytics.displayedSites30d.get(site.id) ?? {
          visits: 0,
          ctaVisitors: 0,
          bookingLeads: 0,
          ctaRate: 0,
          leadRate: 0,
        },
        pendingSourceSuggestionCount:
          site._count.sourceMonitorSuggestions,
        sourceMonitorLastSuccessAt:
          site.sourceMonitorState?.lastSuccessAt ?? null,
        discovery: toOperatorLeadDiscoveryView(site.attributes),
        localSeoAudit: toOperatorLocalSeoAuditView(site.attributes),
      };
    }).sort(compareOperatorSitesByDiscoveryScore),
  };
}

function metadataString(metadata: unknown, key: string): string | null {
  if (
    typeof metadata !== "object" ||
    metadata === null ||
    Array.isArray(metadata) ||
    !(key in metadata)
  ) {
    return null;
  }
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function jsonArrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}
