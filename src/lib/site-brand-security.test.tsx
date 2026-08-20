import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteRenderer } from "@/components/site-renderer";
import { SiteBrand, SourceNavigation } from "@/components/site-brand";
import { restaurantConfig } from "@/lib/verticals/restaurant/config";
import {
  restaurantSiteDraftSchema,
  sampleSiteDraft,
} from "@/lib/verticals/restaurant/schema";
import {
  siteImageUrlSchema,
  sourceDataSchema,
} from "@/lib/verticals/schema";

describe("source navigation security", () => {
  it.each([
    "/menu",
    "/menu?service=dinner#starters",
    "?service=dinner",
    "#starters",
  ])("accepts safe storefront intent %s", (url) => {
    const sourceData = sourceDataSchema.parse({
      navigation: [{ label: "Menu", url }],
    });

    expect(sourceData.navigation[0]).toEqual({
      label: "Menu",
      url,
      destinationUrl: null,
    });
  });

  it.each([false, true])(
    "renders the authenticated source destination on %s surfaces",
    (analyticsEnabled) => {
      const draft = restaurantSiteDraftSchema.parse({
        ...sampleSiteDraft,
        sourceUrl: "https://source.example/",
        sourceData: {
          navigation: [
            {
              label: "Menu",
              url: "/menu",
              destinationUrl: "https://source.example/menu",
            },
          ],
        },
      });

      const markup = renderToStaticMarkup(
        <SiteRenderer
          draft={draft}
          vertical={restaurantConfig.id}
          analyticsEnabled={analyticsEnabled}
        />,
      );

      expect(markup).toContain('href="https://source.example/menu"');
      expect(markup).not.toContain('href="/menu"');
    },
  );

  it("preserves HTTP-only source intent without a public downgrade link", () => {
    const draft = restaurantSiteDraftSchema.parse({
      ...sampleSiteDraft,
      sourceUrl: "http://source.example/",
      sourceData: {
        navigation: [
          { label: "Menu", url: "/menu", destinationUrl: null },
        ],
      },
    });

    const markup = renderToStaticMarkup(
      <SourceNavigation draft={draft} />,
    );

    expect(markup).toContain('data-source-navigation-intent="/menu"');
    expect(markup).not.toContain('href="/menu"');
    expect(markup).not.toContain('href="http://source.example/menu"');
  });

  it.each([
    ["https://attacker.example/menu", "/menu"],
    ["https://source.example/other", "/menu"],
    ["http://source.example/menu", "/menu"],
    ["https://[", "/menu"],
  ])(
    "rejects destination %s that does not authenticate intent %s",
    (destinationUrl, url) => {
      expect(
        restaurantSiteDraftSchema.safeParse({
          ...sampleSiteDraft,
          sourceUrl: "https://source.example/",
          sourceData: {
            navigation: [{ label: "Menu", url, destinationUrl }],
          },
        }).success,
      ).toBe(false);
    },
  );

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "//attacker.example/menu",
    "/\\attacker.example/menu",
    "https:\\attacker.example/menu",
    "https://exa\nmple.com/menu",
    "http://source.example/menu",
    "https://source.example/menu",
    "mailto:owner@source.example",
    "menu",
  ])("rejects unsafe storefront href %s before rendering", (url) => {
    expect(
      sourceDataSchema.safeParse({
        navigation: [{ label: "Menu", url }],
      }).success,
    ).toBe(false);
  });
});

describe("site brand image security", () => {
  it.each([
    "https://images.example/logo.svg",
    "/brands/restaurant/logo.svg",
  ])("accepts and renders safe brand image %s", (logoUrl) => {
    const parsedLogo = siteImageUrlSchema.parse(logoUrl);
    const markup = renderToStaticMarkup(
      <SiteBrand draft={{ name: "Safe Brand", logoUrl: parsedLogo }} />,
    );

    expect(markup).toContain("data-source-brand-mark");
    expect(markup).toContain(logoUrl);
  });

  it.each([
    "javascript:alert(1)",
    "data:image/svg+xml,<svg onload=alert(1)>",
    'https://images.example/logo.svg");color:red;--x:("',
    "https:\\images.example/logo.svg",
    "https://user:pass@images.example/logo.svg",
    "https://images.example:8443/logo.svg",
    "https://127.0.0.1/logo.svg",
    "https://localhost./logo.svg",
    "https://sub.localhost./logo.svg",
    "https://printer.local./logo.svg",
    "https://service.internal./logo.svg",
    "https://metadata.google.internal./logo.svg",
    "https://192.168.1.1./logo.svg",
    "//images.example/logo.svg",
  ])("rejects unsafe brand image %s before CSS rendering", (logoUrl) => {
    expect(siteImageUrlSchema.safeParse(logoUrl).success).toBe(false);
  });

  it.each([
    ["preview", false],
    ["live", true],
  ] as const)(
    "blocks terminal-dot private assets before %s rendering",
    (_surface, analyticsEnabled) => {
      for (const logoUrl of [
        "https://localhost./logo.svg",
        "https://sub.localhost./logo.svg",
        "https://service.internal./logo.svg",
        "https://192.168.1.1./logo.svg",
      ]) {
        const parsed = restaurantSiteDraftSchema.safeParse({
          ...sampleSiteDraft,
          logoUrl,
          faviconUrl: logoUrl,
          heroImageUrl: logoUrl,
          sourceData: {
            navigation: [],
            brandAssets: [
              {
                type: "logo",
                url: logoUrl,
                sourceUrl: "https://source.example/",
                provenance: "official",
                evidence: "meta",
              },
            ],
            evidence: [],
          },
        });

        expect(parsed.success).toBe(false);
        expect(() => {
          if (!parsed.success) throw new Error("unsafe persisted draft");
          return renderToStaticMarkup(
            <SiteRenderer
              draft={parsed.data}
              vertical={restaurantConfig.id}
              analyticsEnabled={analyticsEnabled}
            />,
          );
        }).toThrow("unsafe persisted draft");
      }
    },
  );
});
