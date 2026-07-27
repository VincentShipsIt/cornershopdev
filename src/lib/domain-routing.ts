export type DomainHostnamePlan = {
  canonicalHostname: string;
  hostnames: string[];
  records: Array<{
    hostname: string;
    type: "A" | "CNAME";
    name: string;
  }>;
};

export type PublishedDomainRecord = {
  hostname: string;
  verified: boolean;
  site: {
    id: string;
    slug: string;
    status: "PROSPECT" | "PREVIEW_READY" | "CLAIMED" | "LIVE" | "PAUSED";
    publishedSiteVersionId: string | null;
    publishedSiteVersion: {
      id: string;
      siteId: string;
      publishedAt: Date | null;
    } | null;
  };
};

export type CustomerHostDecision =
  | { kind: "not_found" }
  | {
      kind: "redirect";
      canonicalHostname: string;
    }
  | {
      kind: "page";
      slug: string;
      versionId: string;
      locale: string | null;
    }
  | {
      kind: "public_api";
      slug: string;
      versionId: string;
    };

/**
 * Cornershop's explicit apex/www policy.
 *
 * A two-label hostname and its `www` form are one claim with the apex canonical.
 * Deeper hostnames are exact CNAME claims: guessing registrable domains such as
 * `co.uk` without a maintained public-suffix list would risk claiming a sibling.
 */
export function planDomainHostnames(hostname: string): DomainHostnamePlan {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");
  const withoutWww = normalized.startsWith("www.")
    ? normalized.slice(4)
    : normalized;
  const isApexPair = withoutWww.split(".").length === 2;

  if (isApexPair) {
    return {
      canonicalHostname: withoutWww,
      hostnames: [withoutWww, `www.${withoutWww}`],
      records: [
        { hostname: withoutWww, type: "A", name: "@" },
        {
          hostname: `www.${withoutWww}`,
          type: "CNAME",
          name: "www",
        },
      ],
    };
  }

  return {
    canonicalHostname: normalized,
    hostnames: [normalized],
    records: [
      {
        hostname: normalized,
        type: "CNAME",
        name: normalized.split(".")[0] ?? normalized,
      },
    ],
  };
}

/**
 * Resolves the only surfaces a customer hostname may expose.
 *
 * All owner/operator routes and unrelated public APIs are denied here before
 * Next's filesystem router can see them. The two public write endpoints remain
 * available because the live renderer needs analytics and booking requests.
 */
export function decideCustomerHostRoute(input: {
  hostname: string;
  pathname: string;
  records: PublishedDomainRecord[];
}): CustomerHostDecision {
  const exact = input.records.find(
    (record) =>
      record.hostname === input.hostname &&
      record.verified &&
      hasValidPublishedSite(record),
  );
  if (!exact) return { kind: "not_found" };

  const plan = planDomainHostnames(input.hostname);
  const canonical = input.records.find(
    (record) =>
      record.hostname === plan.canonicalHostname &&
      record.site.id === exact.site.id &&
      record.verified &&
      hasValidPublishedSite(record),
  );
  const surface = customerSurface(input.pathname, exact.site.slug);
  if (surface.kind === "blocked") return { kind: "not_found" };

  if (
    input.hostname !== plan.canonicalHostname &&
    canonical &&
    canonical.site.publishedSiteVersionId ===
      exact.site.publishedSiteVersionId
  ) {
    return {
      kind: "redirect",
      canonicalHostname: plan.canonicalHostname,
    };
  }

  const versionId = exact.site.publishedSiteVersionId;
  if (!versionId) return { kind: "not_found" };
  if (surface.kind === "public_api") {
    return {
      kind: "public_api",
      slug: exact.site.slug,
      versionId,
    };
  }
  return {
    kind: "page",
    slug: exact.site.slug,
    versionId,
    locale: surface.locale,
  };
}

export function siteStatusForDomainState(input: {
  currentStatus: "PROSPECT" | "PREVIEW_READY" | "CLAIMED" | "LIVE" | "PAUSED";
  hasVerifiedDomain: boolean;
  hasValidPublishedVersion: boolean;
}): "PROSPECT" | "PREVIEW_READY" | "CLAIMED" | "LIVE" | "PAUSED" {
  if (input.currentStatus === "PAUSED") return "PAUSED";
  if (
    input.currentStatus !== "CLAIMED" &&
    input.currentStatus !== "LIVE"
  ) {
    return input.currentStatus;
  }
  return input.hasVerifiedDomain && input.hasValidPublishedVersion
    ? "LIVE"
    : "CLAIMED";
}

function hasValidPublishedSite(record: PublishedDomainRecord): boolean {
  const version = record.site.publishedSiteVersion;
  return (
    record.site.status === "LIVE" &&
    Boolean(record.site.publishedSiteVersionId) &&
    version?.id === record.site.publishedSiteVersionId &&
    version.siteId === record.site.id &&
    version.publishedAt instanceof Date
  );
}

function customerSurface(
  pathname: string,
  slug: string,
):
  | { kind: "page"; locale: string | null }
  | { kind: "public_api" }
  | { kind: "blocked" } {
  if (pathname === "/") return { kind: "page", locale: null };
  const locale = pathname.match(/^\/([a-z]{2})\/?$/i)?.[1];
  if (locale) return { kind: "page", locale: locale.toLowerCase() };
  if (pathname === "/api/analytics/events") return { kind: "public_api" };
  if (
    pathname ===
    `/api/sites/${encodeURIComponent(slug)}/booking-requests`
  ) {
    return { kind: "public_api" };
  }
  return { kind: "blocked" };
}
