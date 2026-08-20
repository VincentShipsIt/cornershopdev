import { afterEach, describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ImportStudio } from "@/app/create/import-studio";
import { LocalServiceDashboard } from "@/app/dashboard/local-service-dashboard";
import { SiteRenderer } from "@/components/site-renderer";
import { generateSiteDraft } from "@/lib/ai/site-generation";
import { FACTORY_BRAND } from "@/lib/brand";
import type { ExtractedSite } from "@/lib/importer";
import { reconstructSource } from "@/lib/source-reconstruction";
import { Vertical } from "@/generated/prisma/enums";
import { localServiceConfig } from "@/lib/verticals/local-service/config";
import { sampleLocalServiceSiteDraft } from "@/lib/verticals/local-service/fixtures";

const originalKey = process.env.OPENROUTER_API_KEY;

afterEach(() => {
  if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalKey;
});

describe("local-service surfaces", () => {
  it("renders trade facts and contact conversion without a restaurant request form", () => {
    const html = renderToStaticMarkup(
      <SiteRenderer
        draft={sampleLocalServiceSiteDraft}
        vertical={Vertical.LOCAL_SERVICE}
      />,
    );

    expect(html).toContain("Request a written quote");
    expect(html).toContain("Message on WhatsApp");
    expect(html).toContain("Service areas");
    expect(html).toContain("Credentials and cover");
    expect(html).toContain("Townhouse rewire");
    expect(html).not.toContain("Number of people");
    expect(html).not.toContain("Request a table");
  });

  it("keeps the create action as a real form submit button", () => {
    const html = renderToStaticMarkup(
      <ImportStudio
        initialSource=""
        initialVertical={Vertical.LOCAL_SERVICE}
        initialBrand={{
          ...FACTORY_BRAND,
          vertical: null,
          homeUrl: "https://cornershop.dev",
        }}
      />,
    );

    expect(html).toContain("Local trade");
    expect(html).toContain('type="submit"');
    expect(html).toContain("trade website or business name");
  });

  it("ships a revision-safe private owner editor without publication controls", () => {
    const html = renderToStaticMarkup(
      <LocalServiceDashboard
        initialDraft={sampleLocalServiceSiteDraft}
        initialRevision={7}
        email="owner@harbourelectrical.example"
        brand={FACTORY_BRAND}
        canSwitchWorkspace={false}
      />,
    );

    expect(html).toContain("Draft revision 7");
    expect(html).toContain("Private pilot · publishing disabled");
    expect(html).toContain("Services, proof and contact.");
    expect(html).not.toContain(">Publish<");
  });

  it("reconstructs a sourced French plumber preview without a model or invented claims", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const sourceUrl = new URL("https://atelier-riviere.example/");
    const fixture = await Bun.file(
      new URL("../../__fixtures__/importer/french-plumber.html", import.meta.url),
    ).text();
    const reconstructed = reconstructSource({
      homepage: { html: fixture, url: sourceUrl },
      fallbackName: sourceUrl.hostname,
      links: [],
      fallbackPalette: {
        ...localServiceConfig.presentation.fallbackPalette,
        accentForeground: "#ffffff",
      },
    });
    const extracted: ExtractedSite = {
      source: sourceUrl.toString(),
      sourceUrl: sourceUrl.toString(),
      pageText: fixture,
      links: [
        {
          type: "quote",
          label: "Demander un devis",
          provider: null,
          url: "https://atelier-riviere.example/contact",
        },
      ],
      ...reconstructed,
    };

    const draft = await generateSiteDraft(extracted, localServiceConfig);
    const html = renderToStaticMarkup(
      <SiteRenderer draft={draft} vertical={Vertical.LOCAL_SERVICE} />,
    );

    expect(reconstructed.businessTypes).toContain("plumber");
    expect(draft).toMatchObject({
      defaultLocale: "fr",
      name: "Atelier Rivière Plomberie",
      phone: "+33 4 72 10 20 30",
      email: "bonjour@atelier-riviere.example",
      logoUrl: "https://atelier-riviere.example/assets/logo-riviere.svg",
      faviconUrl: "https://atelier-riviere.example/assets/favicon.png",
      palette: {
        background: "#f5f1e8",
        foreground: "#17313a",
        accent: "#176b87",
      },
      attributes: {
        tradeType: "plumber",
        availabilityPosture: "not-stated",
        credentials: [],
        insuranceStatus: "not-stated",
        trustSignals: [],
        projects: [],
        showProjectGallery: false,
      },
      catalogSections: [
        {
          name: "Interventions de plomberie",
          items: [
            {
              name: "Recherche de fuite",
              price: null,
              available: null,
              attributes: {
                pricingModel: "not-stated",
                emergencyEligible: false,
              },
            },
            {
              name: "Remplacement de robinetterie",
              price: 95,
              currency: "EUR",
              available: null,
              attributes: {
                pricingModel: "fixed",
                emergencyEligible: false,
              },
            },
          ],
        },
      ],
    });
    expect(draft.businessHours).toEqual([
      {
        days: "Monday, Tuesday, Wednesday, Thursday, Friday",
        hours: "08:00–18:00",
      },
    ]);
    expect(draft.sourceData.navigation).toEqual([
      {
        label: "Nos services",
        url: "/services",
        destinationUrl: "https://atelier-riviere.example/services",
      },
      {
        label: "Réalisations",
        url: "/realisations",
        destinationUrl: "https://atelier-riviere.example/realisations",
      },
      {
        label: "Contact",
        url: "/contact",
        destinationUrl: "https://atelier-riviere.example/contact",
      },
    ]);
    expect(draft.sourceData.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "business.type", value: "plumber" }),
        expect.objectContaining({ field: "catalog.item", value: "Recherche de fuite" }),
      ]),
    );
    expect(html).toContain('lang="fr"');
    expect(html).toContain("data-source-brand-mark");
    expect(html).toContain("Nos services");
    expect(html).toContain("Recherche de fuite");
    expect(html).toContain("Remplacement de robinetterie");
    expect(html).toContain("bonjour@atelier-riviere.example");
    expect(html).toContain("Demander un devis");
    expect(html).not.toContain("Emergency callout");
    expect(html).not.toContain("Number of people");
  });
});
