import { describe, expect, it, mock } from "bun:test";
import {
  parseLeadDiscoveryArguments,
  runLeadDiscovery,
} from "@/lib/lead-discovery-runner";
import { parseHomepageSignals } from "@/lib/lead-discovery";
import type { PlaceDiscoveryResult } from "@/lib/lead-discovery-places";

const beautyDiscovery: PlaceDiscoveryResult = {
  provider: "google_places",
  fallbackReason: null,
  places: [
    {
      name: "Studio Iris",
      websiteUrl: "https://studio-iris.example/",
      phone: "+356 2000 0000",
      address: "12 Republic Street, Valletta",
      city: "Valletta",
      placeId: "beauty-1",
      provider: "google_places",
      rating: 4.7,
      reviewCount: 31,
      categories: ["beauty_salon"],
      hours: [{ days: "Monday", hours: "09:00–18:00" }],
      photoCount: 4,
      photoNewestAt: null,
      description: "Independent hair and beauty studio in central Valletta.",
    },
  ],
};

const discoverPlaces = mock(async () => beautyDiscovery);
const fetchHomepage = mock(async () =>
  parseHomepageSignals(
    `<html><head>
      <meta name="viewport" content="width=device-width">
      <meta name="description" content="Independent hair and beauty studio in central Valletta.">
      <title>Studio Iris</title>
      <script type="application/ld+json">{"@type":"BeautySalon"}</script>
    </head><body>
      <a href="/services">Treatments and prices</a>
      <a href="https://www.fresha.com/studio-iris">Book appointment</a>
    </body></html>`,
    new URL("https://studio-iris.example/"),
    null,
    "BEAUTY",
  ),
);

describe("lead discovery command", () => {
  it("dry-runs a configured non-restaurant adapter without writing", async () => {
    const fetchImpl = mock(async () => {
      throw new Error("dry-run must not call the ingest API");
    });
    const result = await runLeadDiscovery(
      {
        vertical: "BEAUTY",
        city: "Valletta",
        limit: 10,
        apiUrl: "https://cornershop.dev",
        execute: false,
      },
      { discoverPlaces, fetchHomepage, fetchImpl, env: {} },
    );

    expect(result).toMatchObject({
      mode: "dry-run",
      preflight: "dry-run",
      vertical: "BEAUTY",
      adapterId: "beauty-local-v1",
      query: "beauty salons and barbers in Valletta",
      candidateCount: 1,
    });
    expect(result.candidates[0]).toMatchObject({
      name: "Studio Iris",
      score: 100,
      previewAction: "generate",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("executes through authenticated ingest with preview and evidence metadata", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const fetchImpl = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Response.json({
        ok: true,
        created: true,
        previewGenerated: true,
        siteSlug: "studio-iris",
      });
    });
    const result = await runLeadDiscovery(
      {
        vertical: "BEAUTY",
        city: "Valletta",
        limit: 10,
        apiUrl: "https://cornershop.dev",
        execute: true,
      },
      {
        discoverPlaces,
        fetchHomepage,
        fetchImpl,
        env: { OPERATOR_LEAD_INGEST_TOKEN: "test-ingest-token" },
      },
    );

    expect(result).toMatchObject({
      mode: "execute",
      preflight: "executed",
      ingested: 1,
      failed: 0,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      vertical: "BEAUTY",
      categories: ["beauty_salon"],
      eligibility: "UNKNOWN",
      eligibilityEvidence: {
        discovery_adapter: "beauty-local-v1",
        public_source: "https://studio-iris.example/",
      },
      generatePreview: true,
    });
  });

  it("parses every registered vertical slug and rejects an unconfigured one", () => {
    expect(
      parseLeadDiscoveryArguments([
        "--vertical",
        "beauty",
        "--city",
        "Valletta",
      ]).vertical,
    ).toBe("BEAUTY");
    expect(() =>
      parseLeadDiscoveryArguments([
        "--vertical",
        "food_retail",
        "--city",
        "Valletta",
      ]),
    ).toThrow("No discovery adapter is configured");
  });
});
