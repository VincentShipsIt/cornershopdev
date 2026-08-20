import { afterEach, describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteRenderer } from "@/components/site-renderer";
import { generateSiteDraft } from "@/lib/ai/site-generation";
import type { ExtractedSite } from "@/lib/importer";
import { siteDraftScalarData } from "@/lib/site-persistence";
import {
  contrastRatio,
  reconstructSource,
  repairPalette,
  safeSourceAssetUrl,
} from "@/lib/source-reconstruction";
import { restaurantConfig } from "@/lib/verticals/restaurant/config";

const fallbackPalette = {
  background: "#f4efe5",
  foreground: "#1d241f",
  accent: "#a5482d",
  accentForeground: "#ffffff",
};

const originalKey = process.env.OPENROUTER_API_KEY;

afterEach(() => {
  if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalKey;
});

async function fixture(name: string): Promise<string> {
  return Bun.file(new URL(`__fixtures__/importer/${name}`, import.meta.url)).text();
}

describe("deterministic source reconstruction", () => {
  it("recovers multilingual structured facts, branding, navigation, and a bounded menu with evidence", async () => {
    const html = await fixture("french-restaurant.html");
    const reconstructed = reconstructSource({
      homepage: { html, url: new URL("https://maisonsafran.example/") },
      fallbackName: "maisonsafran.example",
      links: [],
      fallbackPalette,
    });

    expect(reconstructed).toMatchObject({
      sourceLocale: "fr",
      name: "Maison Safran",
      description:
        "Une table de quartier à Paris, avec une carte courte inspirée par le marché.",
      address: "12 rue des Fleurs, 75010, Paris, FR",
      phone: "+33 1 42 00 00 00",
      email: "bonjour@maisonsafran.example",
      logoUrl: "https://cdn.maisonsafran.example/logo.svg",
      faviconUrl: "https://maisonsafran.example/favicon.png",
      heroImageUrl: "https://cdn.maisonsafran.example/hero.jpg",
      businessHours: [
        { days: "Tuesday, Wednesday, Thursday", hours: "12:00–22:30" },
      ],
      navigation: [
        {
          label: "La carte",
          url: "/menu",
          destinationUrl: "https://maisonsafran.example/menu",
        },
        {
          label: "Notre histoire",
          url: "/a-propos",
          destinationUrl: "https://maisonsafran.example/a-propos",
        },
      ],
    });
    expect(reconstructed.catalogSections).toEqual([
      {
        name: "À partager",
        description: "Pour commencer",
        items: [
          {
            name: "Poireaux vinaigrette",
            description: "Noisettes torréfiées et moutarde ancienne",
            price: 11,
            currency: "EUR",
            availability: null,
            imageUrl: "https://cdn.maisonsafran.example/poireaux.jpg",
          },
          {
            name: "Œuf mayonnaise",
            description: "Câpres et herbes fraîches",
            price: 8.5,
            currency: "EUR",
            availability: null,
            imageUrl: null,
          },
        ],
      },
    ]);
    expect(reconstructed.brandAssets.map((asset) => asset.type)).toContain("logo");
    expect(reconstructed.brandAssets.map((asset) => asset.type)).toContain("favicon");
    expect(reconstructed.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "name", method: "json-ld" }),
        expect.objectContaining({ field: "catalog.item", value: "Œuf mayonnaise" }),
      ]),
    );
  });

  it("preserves same-origin navigation from an HTTP-only source as internal hrefs", async () => {
    const html = await fixture("http-only-source.html");
    const reconstructed = reconstructSource({
      homepage: { html, url: new URL("http://legacy-bistro.example/") },
      fallbackName: "legacy-bistro.example",
      links: [],
      fallbackPalette,
    });

    expect(reconstructed.navigation).toEqual([
      {
        label: "Lunch menu",
        url: "/menu?service=lunch#specials",
        destinationUrl: null,
      },
    ]);
  });

  it("replaces out-of-range numeric entities without failing no-model import", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const sourceUrl = new URL("https://malformed-entities.example/");
    const reconstructed = reconstructSource({
      homepage: {
        html: `
          <html lang="en">
            <head>
              <meta name="description" content="A cafe with malformed &#x110000; and &#999999999999999999999; entities.">
            </head>
            <body><h1>Entity Cafe</h1></body>
          </html>
        `,
        url: sourceUrl,
      },
      fallbackName: sourceUrl.hostname,
      links: [],
      fallbackPalette,
    });

    expect(reconstructed.description).toBe(
      "A cafe with malformed � and � entities.",
    );
    await expect(
      generateSiteDraft(
        {
          source: sourceUrl.toString(),
          sourceUrl: sourceUrl.toString(),
          pageText: reconstructed.description,
          links: [],
          ...reconstructed,
        },
        restaurantConfig,
      ),
    ).resolves.toMatchObject({
      description: "A cafe with malformed � and � entities.",
    });
  });

  it.each([500, 501, 100_000])(
    "bounds %i-character evidence before no-model draft parsing",
    async (length) => {
      delete process.env.OPENROUTER_API_KEY;
      const sourceUrl = new URL("https://long-evidence.example/");
      const description = "x".repeat(length);
      const reconstructed = reconstructSource({
        homepage: {
          html: `<html lang="en"><head><meta name="description" content="${description}"></head><body><h1>Long Evidence</h1></body></html>`,
          url: sourceUrl,
        },
        fallbackName: sourceUrl.hostname,
        links: [],
        fallbackPalette,
      });
      const evidence = reconstructed.evidence.find(
        (entry) => entry.field === "description",
      );

      expect(reconstructed.description).toBe("x".repeat(500));
      expect(evidence).toMatchObject({
        value: "x".repeat(500),
        method: "meta",
        sourceUrl: sourceUrl.toString(),
      });
      expect(evidence?.excerpt.length).toBeLessThanOrEqual(280);

      const extracted: ExtractedSite = {
        source: sourceUrl.toString(),
        sourceUrl: sourceUrl.toString(),
        pageText: reconstructed.description,
        links: [],
        ...reconstructed,
      };
      await expect(
        generateSiteDraft(extracted, restaurantConfig),
      ).resolves.toMatchObject({
        description: "x".repeat(500),
        sourceData: {
          evidence: expect.arrayContaining([
            expect.objectContaining({ value: "x".repeat(500) }),
          ]),
        },
      });
    },
  );

  it("normalizes mailto email candidates and skips malformed earlier evidence", () => {
    const sourceUrl = new URL("https://email-source.example/");
    const reconstructed = reconstructSource({
      homepage: {
        html: `
          <html lang="en">
            <head>
              <script type="application/ld+json">
                {
                  "@context": "https://schema.org",
                  "@type": "Restaurant",
                  "name": "Email Source",
                  "email": "owner@example.com?subject=poisoned"
                }
              </script>
            </head>
            <body>
              <a href="mailto:broken%ZZ@example.com">Broken email</a>
              <a href="mailto:Hello@Example.com?subject=Booking">Email us</a>
            </body>
          </html>
        `,
        url: sourceUrl,
      },
      fallbackName: sourceUrl.hostname,
      links: [],
      fallbackPalette,
    });

    expect(reconstructed.email).toBe("hello@example.com");
    expect(reconstructed.evidence).toContainEqual(
      expect.objectContaining({
        field: "email",
        value: "hello@example.com",
        method: "link",
      }),
    );
  });

  it.each([
    ["mailto:hello@example.com", "hello@example.com"],
    ["not an email", "fallback@example.com"],
    ["mailto:%0A@example.com", "fallback@example.com"],
  ])("selects the next valid email after %s", (jsonEmail, expected) => {
    const sourceUrl = new URL("https://email-candidates.example/");
    const reconstructed = reconstructSource({
      homepage: {
        html: `
          <html lang="en">
            <head>
              <script type="application/ld+json">
                {
                  "@context": "https://schema.org",
                  "@type": "Restaurant",
                  "name": "Email Candidates",
                  "email": ${JSON.stringify(jsonEmail)}
                }
              </script>
            </head>
            <body><span itemprop="email">fallback@example.com</span></body>
          </html>
        `,
        url: sourceUrl,
      },
      fallbackName: sourceUrl.hostname,
      links: [],
      fallbackPalette,
    });

    expect(reconstructed.email).toBe(expected);
  });

  it("degrades safely across malformed HTML and JSON-LD without accepting private assets", async () => {
    const html = await fixture("malformed-spanish-site.html");
    const reconstructed = reconstructSource({
      homepage: { html, url: new URL("https://tallerluz.example/") },
      fallbackName: "tallerluz.example",
      links: [],
      fallbackPalette,
    });

    expect(reconstructed.sourceLocale).toBe("es");
    expect(reconstructed.name).toBe("Taller Luz");
    expect(reconstructed.description).toBe(
      "Cortes, color y cuidado capilar en el centro de Valencia.",
    );
    expect(reconstructed.phone).toBe("+34960000000");
    expect(reconstructed.logoUrl).toBeNull();
    expect(reconstructed.faviconUrl).toBeNull();
    expect(reconstructed.heroImageUrl).toBeNull();
    expect(reconstructed.catalogSections).toEqual([
      {
        name: "Catalog",
        description: "",
        items: [
          {
            name: "Corte y peinado",
            description: "Lavado, corte personalizado y acabado",
            price: 35,
            currency: "EUR",
            availability: null,
            imageUrl: null,
          },
        ],
      },
    ]);
  });

  it("keeps child-page JSON-LD provenance and resolves relative assets against that page", () => {
    const childUrl = new URL("https://atelier.example/services/menu/");
    const reconstructed = reconstructSource({
      homepage: {
        html: "<html lang=\"en\"><head><title>Atelier</title></head><body><h1>Atelier</h1></body></html>",
        url: new URL("https://atelier.example/"),
      },
      pages: [
        {
          url: childUrl,
          html: `<script type="application/ld+json">
            {
              "@graph": [
                {
                  "@type": "LocalBusiness",
                  "name": "Atelier Services",
                  "description": "Evidence-backed services from the discovered child page.",
                  "image": "media/hero.jpg"
                },
                {
                  "@type": "Service",
                  "name": "Signature consultation",
                  "description": "A sixty minute consultation.",
                  "image": "images/consultation.jpg",
                  "offers": {
                    "price": "75",
                    "priceCurrency": "EUR",
                    "availability": "https://schema.org/InStock"
                  }
                }
              ]
            }
          </script>`,
        },
      ],
      fallbackName: "atelier.example",
      links: [],
      fallbackPalette,
    });

    expect(reconstructed.name).toBe("Atelier Services");
    expect(reconstructed.heroImageUrl).toBe(
      "https://atelier.example/services/menu/media/hero.jpg",
    );
    expect(reconstructed.catalogSections[0]?.items[0]).toMatchObject({
      name: "Signature consultation",
      availability: true,
      imageUrl:
        "https://atelier.example/services/menu/images/consultation.jpg",
    });
    expect(reconstructed.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "name",
          sourceUrl: childUrl.toString(),
        }),
        expect.objectContaining({
          field: "catalog.item",
          sourceUrl: childUrl.toString(),
        }),
      ]),
    );
    expect(reconstructed.brandAssets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: "https://atelier.example/services/menu/images/consultation.jpg",
          sourceUrl: childUrl.toString(),
        }),
      ]),
    );
  });

  it("repairs text and accent contrast while retaining normalized source colours", () => {
    const palette = repairPalette(
      { background: "#fff8e8", foreground: "#fffdf8", accent: "#f4d03f" },
      fallbackPalette,
    );

    expect(palette.background).toBe("#fff8e8");
    expect(contrastRatio(palette.background, palette.foreground)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(palette.background, palette.accent)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(palette.accent, palette.accentForeground)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    "http://images.example/logo.png",
    "https://user:pass@images.example/logo.png",
    "https://images.example:8443/logo.png",
    "https://127.0.0.1/logo.png",
    "https://2130706433/logo.png",
    "https://0x7f000001/logo.png",
    "https://0177.0.0.1/logo.png",
    "https://127.1/logo.png",
    "https://169.254.169.254/latest/meta-data/",
    "https://[::1]/logo.png",
    "data:image/png;base64,abc",
  ])("rejects unsafe source asset URL %s", (value) => {
    expect(safeSourceAssetUrl(value, new URL("https://example.com"))).toBeNull();
  });

  it("runs fixture HTML through the no-model draft and customer renderer", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const sourceUrl = new URL("https://maisonsafran.example/");
    const reconstructed = reconstructSource({
      homepage: {
        html: await fixture("french-restaurant.html"),
        url: sourceUrl,
      },
      fallbackName: sourceUrl.hostname,
      links: [],
      fallbackPalette,
    });
    const extracted: ExtractedSite = {
      source: sourceUrl.toString(),
      sourceUrl: sourceUrl.toString(),
      pageText: reconstructed.description,
      links: [],
      ...reconstructed,
    };

    const draft = await generateSiteDraft(extracted, restaurantConfig);
    const persisted = siteDraftScalarData(draft, restaurantConfig.id);
    const markup = renderToStaticMarkup(
      <SiteRenderer draft={draft} vertical={restaurantConfig.id} />,
    );

    expect(draft.autoEnhanceImages).toBe(false);
    expect(draft.defaultLocale).toBe("fr");
    expect(draft.sourceData.evidence.length).toBeGreaterThan(5);
    expect(draft.catalogSections[0]?.items).toHaveLength(2);
    expect(
      draft.catalogSections[0]?.items.map((item) => item.available),
    ).toEqual([null, null]);
    expect(persisted).toMatchObject({
      email: "bonjour@maisonsafran.example",
      logoUrl: "https://cdn.maisonsafran.example/logo.svg",
      faviconUrl: "https://maisonsafran.example/favicon.png",
      sourceData: expect.objectContaining({
        navigation: expect.any(Array),
        brandAssets: expect.any(Array),
        evidence: expect.any(Array),
      }),
    });
    expect(markup).toContain("Maison Safran");
    expect(markup).toContain("data-source-brand-mark");
    expect(markup).toContain("--theme-bg:#fff8e8");
    expect(markup).toContain("Poireaux vinaigrette");
    expect(markup).toContain("bonjour@maisonsafran.example");
    expect(markup).toContain("La carte");
  });
});
