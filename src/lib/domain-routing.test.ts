import { describe, expect, it } from "bun:test";
import {
  decideCustomerHostRoute,
  planDomainHostnames,
  siteStatusForDomainState,
  type PublishedDomainRecord,
} from "@/lib/domain-routing";

describe("custom-domain hostname plans", () => {
  it("claims an apex and www together with the apex canonical", () => {
    expect(planDomainHostnames("www.example.com")).toEqual({
      canonicalHostname: "example.com",
      hostnames: ["example.com", "www.example.com"],
      records: [
        { hostname: "example.com", type: "A", name: "@" },
        { hostname: "www.example.com", type: "CNAME", name: "www" },
      ],
    });
    expect(planDomainHostnames("example.com")).toEqual(
      planDomainHostnames("www.example.com"),
    );
  });

  it("does not guess a registrable parent for deeper hostnames", () => {
    expect(planDomainHostnames("book.example.co.uk")).toEqual({
      canonicalHostname: "book.example.co.uk",
      hostnames: ["book.example.co.uk"],
      records: [
        {
          hostname: "book.example.co.uk",
          type: "CNAME",
          name: "book",
        },
      ],
    });
  });
});

describe("customer host isolation", () => {
  it("serves only root, locales, public site endpoints and the OG image", () => {
    const records = livePair();
    expect(
      decideCustomerHostRoute({
        hostname: "example.com",
        pathname: "/",
        records,
      }),
    ).toEqual({
      kind: "page",
      slug: "chez-lea",
      versionId: "version_1",
      locale: null,
    });
    expect(
      decideCustomerHostRoute({
        hostname: "example.com",
        pathname: "/fr",
        records,
      }),
    ).toEqual({
      kind: "page",
      slug: "chez-lea",
      versionId: "version_1",
      locale: "fr",
    });
    expect(
      decideCustomerHostRoute({
        hostname: "example.com",
        pathname: "/api/analytics/events",
        records,
      }).kind,
    ).toBe("public_api");
    expect(
      decideCustomerHostRoute({
        hostname: "example.com",
        pathname: "/api/sites/chez-lea/booking-requests",
        records,
      }).kind,
    ).toBe("public_api");
    expect(
      decideCustomerHostRoute({
        hostname: "example.com",
        pathname: "/preview/chez-lea/opengraph-image",
        records,
      }),
    ).toEqual({
      kind: "opengraph",
      slug: "chez-lea",
      versionId: "version_1",
    });
    expect(
      decideCustomerHostRoute({
        hostname: "example.com",
        pathname: "/preview/chez-lea/fr/opengraph-image",
        records,
      }).kind,
    ).toBe("opengraph");

    for (const pathname of [
      "/dashboard",
      "/admin",
      "/sign-in",
      "/create",
      "/preview/chez-lea",
      "/preview/other-site/opengraph-image",
      "/api/domains",
      "/api/sites/another/booking-requests",
    ]) {
      expect(
        decideCustomerHostRoute({
          hostname: "example.com",
          pathname,
          records,
        }),
      ).toEqual({ kind: "not_found" });
    }
  });

  it("permanently canonicalizes a verified www alias", () => {
    expect(
      decideCustomerHostRoute({
        hostname: "www.example.com",
        pathname: "/fr",
        records: livePair(),
      }),
    ).toEqual({
      kind: "redirect",
      canonicalHostname: "example.com",
    });
  });

  it("rejects unknown, unverified, paused and invalid snapshots", () => {
    const base = livePair()[0];
    for (const record of [
      { ...base, verified: false },
      { ...base, site: { ...base.site, status: "PAUSED" as const } },
      {
        ...base,
        site: {
          ...base.site,
          publishedSiteVersion: {
            ...base.site.publishedSiteVersion!,
            siteId: "site_other",
          },
        },
      },
      {
        ...base,
        site: {
          ...base.site,
          publishedSiteVersion: {
            ...base.site.publishedSiteVersion!,
            publishedAt: null,
          },
        },
      },
    ]) {
      expect(
        decideCustomerHostRoute({
          hostname: "example.com",
          pathname: "/",
          records: [record],
        }),
      ).toEqual({ kind: "not_found" });
    }
  });
});

describe("site domain lifecycle", () => {
  it("requires both a verified domain and a valid snapshot for LIVE", () => {
    expect(
      siteStatusForDomainState({
        currentStatus: "CLAIMED",
        hasVerifiedDomain: true,
        hasValidPublishedVersion: true,
      }),
    ).toBe("LIVE");
    expect(
      siteStatusForDomainState({
        currentStatus: "LIVE",
        hasVerifiedDomain: false,
        hasValidPublishedVersion: true,
      }),
    ).toBe("CLAIMED");
    expect(
      siteStatusForDomainState({
        currentStatus: "LIVE",
        hasVerifiedDomain: true,
        hasValidPublishedVersion: false,
      }),
    ).toBe("CLAIMED");
  });

  it("never bypasses a pause or changes pre-claim states", () => {
    expect(
      siteStatusForDomainState({
        currentStatus: "PAUSED",
        hasVerifiedDomain: true,
        hasValidPublishedVersion: true,
      }),
    ).toBe("PAUSED");
    expect(
      siteStatusForDomainState({
        currentStatus: "PREVIEW_READY",
        hasVerifiedDomain: true,
        hasValidPublishedVersion: true,
      }),
    ).toBe("PREVIEW_READY");
  });
});

function livePair(): PublishedDomainRecord[] {
  const site = {
    id: "site_1",
    slug: "chez-lea",
    status: "LIVE" as const,
    publishedSiteVersionId: "version_1",
    publishedSiteVersion: {
      id: "version_1",
      siteId: "site_1",
      publishedAt: new Date("2026-07-27T00:00:00.000Z"),
    },
  };
  return [
    { hostname: "example.com", verified: true, site },
    { hostname: "www.example.com", verified: true, site },
  ];
}
