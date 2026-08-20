import { describe, expect, it } from "bun:test";
import {
  buildProspectIdentity,
  parseHomepageSignals,
  scoreWebsiteQuality,
} from "@/lib/lead-discovery";

describe("prospect identity", () => {
  it("dedupes equivalent websites onto one sourceKey", () => {
    const first = buildProspectIdentity({
      websiteUrl: "https://www.Example.com/menu/?utm_source=maps",
      placeId: "ChIJ-one",
      provider: "google_places",
    });
    const second = buildProspectIdentity({
      websiteUrl: "example.com/menu/",
      placeId: "ChIJ-two",
      provider: "nominatim",
    });

    expect(first.sourceKey).toBe("url:example.com/menu");
    expect(second.sourceKey).toBe(first.sourceKey);
  });

  it("keeps place-only businesses unique when no website exists", () => {
    const google = buildProspectIdentity({
      websiteUrl: null,
      placeId: "ChIJ123",
      provider: "google_places",
    });
    const osm = buildProspectIdentity({
      websiteUrl: "  ",
      placeId: "node/99",
      provider: "nominatim",
    });

    expect(google.sourceKey).toBe("name:place:google:chij123");
    expect(osm.sourceKey).toBe("name:place:osm:node/99");
    expect(google.sourceKey).not.toBe(osm.sourceKey);
  });
});

describe("website quality scoring", () => {
  it("explains a missing website without claiming a fetch", () => {
    expect(
      scoreWebsiteQuality({ hasWebsite: false, homepage: null }),
    ).toEqual({
      score: 60,
      reasons: ["No public website listed"],
    });
  });

  it("records the cheap homepage deductions operators can act on", () => {
    const homepage = parseHomepageSignals(
      `<html>
        <head>
          <meta name="viewport" content="width=1280">
          <title></title>
        </head>
        <body>
          <frameset></frameset>
          <script></script><script></script><script></script><script></script>
          <script></script><script></script><script></script><script></script>
          <script></script><script></script><script></script><script></script>
          <script></script><script></script><script></script><script></script>
          <script></script><script></script><script></script><script></script>
          <script></script>
          ${"x".repeat(800_001)}
        </body>
      </html>`,
      new URL("http://bistro.example/"),
      "Mon, 01 Jan 2018 00:00:00 GMT",
    );

    const scored = scoreWebsiteQuality({
      hasWebsite: true,
      homepage,
    });

    expect(scored.score).toBe(27);
    expect(scored.reasons).toEqual([
      "Homepage is HTTP, not HTTPS",
      "Viewport looks desktop-only",
      "Homepage uses frameset or Flash",
      "No menu or carte link found on the homepage",
      "No booking or reservation link found",
      "Homepage title is missing",
      "Homepage HTML is unusually large",
      "Homepage loads many scripts",
      "Homepage Last-Modified is older than two years",
    ]);
  });

  it("keeps a modern homepage at 100", () => {
    const homepage = parseHomepageSignals(
      `<html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Chez Lea</title>
          <script type="application/ld+json">{"@type":"Restaurant"}</script>
        </head>
        <body>
          <a href="/menu">Menu</a>
          <a href="https://www.opentable.com/r/chez-lea">Reserve</a>
        </body>
      </html>`,
      new URL("https://chez-lea.example/"),
    );

    expect(scoreWebsiteQuality({ hasWebsite: true, homepage })).toEqual({
      score: 100,
      reasons: [],
    });
    expect(homepage.hasRestaurantJsonLd).toBe(true);
  });

  it("scores beauty catalog and booking signals with its own vocabulary", () => {
    const homepage = parseHomepageSignals(
      `<html><head>
        <meta name="viewport" content="width=device-width">
        <title>Studio Iris</title>
        <script type="application/ld+json">{"@type":"BeautySalon"}</script>
      </head><body>
        <a href="/services">Treatments</a>
        <a href="https://www.fresha.com/studio-iris">Book appointment</a>
      </body></html>`,
      new URL("https://studio-iris.example/"),
      null,
      "BEAUTY",
    );

    expect(
      scoreWebsiteQuality({
        vertical: "BEAUTY",
        hasWebsite: true,
        homepage,
      }),
    ).toEqual({ score: 100, reasons: [] });
    expect(homepage.hasBusinessJsonLd).toBe(true);
    expect(homepage.hasCatalogHint).toBe(true);
    expect(homepage.hasConversionHint).toBe(true);
  });
});
