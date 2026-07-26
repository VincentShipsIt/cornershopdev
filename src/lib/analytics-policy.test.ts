import { describe, expect, it } from "bun:test";
import {
  analyticsRequestHostname,
  isLikelyAutomatedRequest,
  resolveEligibleAnalyticsSite,
  type AnalyticsHostLookup,
} from "@/lib/analytics-policy";

describe("analytics request hostname", () => {
  it("prefers and normalizes the first forwarded hostname", () => {
    const headers = new Headers({
      "x-forwarded-host": " Customer.Example:443, proxy.internal ",
      host: "container:3000",
    });

    expect(analyticsRequestHostname(headers)).toBe("customer.example");
  });

  it("falls back to Host when the forwarded value is blank", () => {
    const headers = new Headers({
      "x-forwarded-host": " ",
      host: "Customer.Example.:3000",
    });

    expect(analyticsRequestHostname(headers)).toBe("customer.example");
  });
});

describe("automated analytics requests", () => {
  it("rejects prefetches without retaining their headers", () => {
    expect(
      isLikelyAutomatedRequest(
        new Headers({
          purpose: "prefetch",
          "user-agent": "Mozilla/5.0",
        }),
      ),
    ).toBe(true);
    expect(
      isLikelyAutomatedRequest(
        new Headers({
          "next-router-prefetch": "1",
          "user-agent": "Mozilla/5.0",
        }),
      ),
    ).toBe(true);
  });

  it("rejects known crawlers and missing user agents", () => {
    expect(
      isLikelyAutomatedRequest(
        new Headers({ "user-agent": "Googlebot/2.1" }),
      ),
    ).toBe(true);
    expect(isLikelyAutomatedRequest(new Headers())).toBe(true);
  });

  it("admits an ordinary browser request", () => {
    expect(
      isLikelyAutomatedRequest(
        new Headers({
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Safari/537.36",
        }),
      ),
    ).toBe(false);
  });
});

describe("analytics host eligibility", () => {
  it("rejects factory and niche hosts before querying tenant data", async () => {
    let lookups = 0;
    const lookup: AnalyticsHostLookup = async () => {
      lookups += 1;
      return { id: "site_1", slug: "chez-lea", verified: true };
    };

    expect(
      await resolveEligibleAnalyticsSite({
        hostname: "RestoFront.com:443",
        isFactory: (hostname) => hostname === "restofront.com",
        lookup,
      }),
    ).toBeNull();
    expect(lookups).toBe(0);
  });

  it("requires the hostname lookup to return a verified site", async () => {
    expect(
      await resolveEligibleAnalyticsSite({
        hostname: "Preview.Example:443",
        isFactory: () => false,
        lookup: async (hostname) => ({
          id: "site_1",
          slug: hostname,
          verified: false,
        }),
      }),
    ).toBeNull();
  });

  it("returns the verified site for a normalized customer hostname", async () => {
    const visited: string[] = [];
    const site = { id: "site_1", slug: "chez-lea", verified: true };

    expect(
      await resolveEligibleAnalyticsSite({
        hostname: " WWW.Chez-Lea.Example:443 ",
        isFactory: () => false,
        lookup: async (hostname) => {
          visited.push(hostname);
          return site;
        },
      }),
    ).toEqual(site);
    expect(visited).toEqual(["www.chez-lea.example"]);
  });
});
