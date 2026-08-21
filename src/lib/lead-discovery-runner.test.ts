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
      query: "beauty businesses in Valletta",
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
    const fetchImpl = mock(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(
          JSON.parse(String(init?.body)) as Record<string, unknown>,
        );
        return Response.json({
          ok: true,
          created: true,
          previewGenerated: true,
          siteSlug: "studio-iris",
        });
      },
    );
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

  it.each([
    {
      vertical: "FOOD_RETAIL" as const,
      adapterId: "food-retail-local-v1",
      query:
        "bakeries, pastry shops, butchers, delis, cheesemongers and grocers in Valletta",
      name: "Le Fournil",
      category: "bakery",
      catalog: "products",
      conversion: "Pre-order for pickup",
      schemaType: "Bakery",
    },
    {
      vertical: "LOCAL_SERVICE" as const,
      adapterId: "local-service-local-v1",
      query:
        "plumbers, electricians, builders, repair services and artisans in Valletta",
      name: "Harbour Electrics",
      category: "electrician",
      catalog: "services",
      conversion: "Request a quote on WhatsApp",
      schemaType: "Electrician",
    },
  ])(
    "dry-runs and executes $vertical through its niche adapter",
    async ({
      vertical,
      adapterId,
      query,
      name,
      category,
      catalog,
      conversion,
      schemaType,
    }) => {
      const sourceUrl = `https://${name.toLowerCase().replaceAll(" ", "-")}.example/`;
      const discoverVertical = mock(
        async (): Promise<PlaceDiscoveryResult> => ({
          provider: "google_places",
          fallbackReason: null,
          places: [
            {
              ...beautyDiscovery.places[0]!,
              name,
              websiteUrl: sourceUrl,
              placeId: `${vertical.toLowerCase()}-1`,
              categories: [category],
            },
          ],
        }),
      );
      const fetchVerticalHomepage = mock(async () =>
        parseHomepageSignals(
          `<html><head>
            <meta name="viewport" content="width=device-width">
            <meta name="description" content="Source-backed local business.">
            <title>${name}</title>
            <script type="application/ld+json">{"@type":"${schemaType}"}</script>
          </head><body>
            <a href="/${catalog}">${catalog}</a>
            <a href="/contact">${conversion}</a>
          </body></html>`,
          new URL(sourceUrl),
          null,
          vertical,
        ),
      );
      const requests: Array<Record<string, unknown>> = [];
      const fetchImpl = mock(
        async (_input: RequestInfo | URL, init?: RequestInit) => {
          requests.push(
            JSON.parse(String(init?.body)) as Record<string, unknown>,
          );
          return Response.json({
            ok: true,
            created: true,
            previewGenerated: true,
            siteSlug: name.toLowerCase().replaceAll(" ", "-"),
          });
        },
      );

      const dryRun = await runLeadDiscovery(
        {
          vertical,
          city: "Valletta",
          limit: 10,
          apiUrl: "https://cornershop.dev",
          execute: false,
        },
        {
          discoverPlaces: discoverVertical,
          fetchHomepage: fetchVerticalHomepage,
          fetchImpl,
          env: {},
        },
      );
      expect(dryRun).toMatchObject({
        preflight: "dry-run",
        vertical,
        adapterId,
        query,
        candidateCount: 1,
        candidates: [
          expect.objectContaining({
            name,
            categoryFit: "matched",
            previewAction: "generate",
          }),
        ],
      });
      expect(fetchImpl).not.toHaveBeenCalled();

      const executed = await runLeadDiscovery(
        {
          vertical,
          city: "Valletta",
          limit: 10,
          apiUrl: "https://cornershop.dev",
          execute: true,
        },
        {
          discoverPlaces: discoverVertical,
          fetchHomepage: fetchVerticalHomepage,
          fetchImpl,
          env: { OPERATOR_LEAD_INGEST_TOKEN: "test-ingest-token" },
        },
      );
      expect(executed).toMatchObject({
        preflight: "executed",
        ingested: 1,
        failed: 0,
      });
      expect(requests[0]).toMatchObject({
        vertical,
        categories: [category],
        eligibility: "UNKNOWN",
        eligibilityEvidence: {
          discovery_adapter: adapterId,
          category_fit: "matched",
          listing_categories: category,
        },
        generatePreview: true,
      });
    },
  );

  it("parses every registered vertical slug and rejects an unknown one", () => {
    for (const [slug, vertical] of [
      ["restaurant", "RESTAURANT"],
      ["beauty", "BEAUTY"],
      ["food_retail", "FOOD_RETAIL"],
      ["local_service", "LOCAL_SERVICE"],
    ] as const) {
      expect(
        parseLeadDiscoveryArguments(["--vertical", slug, "--city", "Valletta"])
          .vertical,
      ).toBe(vertical);
    }
    expect(() =>
      parseLeadDiscoveryArguments([
        "--vertical",
        "accountant",
        "--city",
        "Valletta",
      ]),
    ).toThrow("No discovery adapter is configured for accountant");
  });
});
