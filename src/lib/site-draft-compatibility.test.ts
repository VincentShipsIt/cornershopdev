import { describe, expect, it, mock } from "bun:test";
import { Vertical } from "@/generated/prisma/enums";
import { deterministicDraft } from "@/lib/ai/site-generation";
import {
  siteDraftScalarData,
  type PersistableSiteDraft,
} from "@/lib/site-persistence";
import type {
  PersistedSiteDraftRecord,
  PublishedSiteVersionRecord,
} from "@/lib/sites";
import { restaurantConfig } from "@/lib/verticals/restaurant/config";
import { sampleSiteDraft } from "@/lib/verticals/restaurant/schema";
import { beautyConfig } from "@/lib/verticals/beauty/config";
import { sampleFoodRetailDraft } from "@/lib/verticals/food-retail/fixtures";

mock.module("server-only", () => ({}));

const { projectPublishedSiteVersion, projectSiteDraft } = await import(
  "@/lib/sites"
);

const sourceUrl = "https://legacy.example/";
const legacyImageUrl = "http://legacy.example/hero.jpg";
const sourceData = {
  navigation: [
    { label: "Menu", url: "https://legacy.example/menu" },
  ],
  brandAssets: [
    {
      type: "hero",
      url: legacyImageUrl,
      sourceUrl,
      provenance: "official",
      evidence: "meta",
    },
  ],
  evidence: [],
};

describe("persisted site draft compatibility", () => {
  it("loads a legacy Site row without exposing HTTP images", () => {
    const loaded = projectSiteDraft(legacySiteRecord());
    const draft = loaded.draft as typeof sampleSiteDraft;

    expect(draft).toMatchObject({
      sourceUrl,
      logoUrl: null,
      faviconUrl: null,
      heroImageUrl: null,
      heroOriginalImageUrl: null,
      sourceData: {
        navigation: [
          {
            label: "Menu",
            url: "/menu",
            destinationUrl: "https://legacy.example/menu",
          },
        ],
        brandAssets: [],
      },
    });
    expect(draft.catalogSections[0]?.items[0]).toMatchObject({
      imageUrl: null,
      originalImageUrl: null,
    });
  });

  it("loads a legacy SiteVersion snapshot without exposing HTTP images", () => {
    const scalar = siteDraftScalarData(
      sampleSiteDraft,
      restaurantConfig.id,
    );
    const content = {
      ...sampleSiteDraft,
      sourceUrl,
      logoUrl: legacyImageUrl,
      faviconUrl: legacyImageUrl,
      heroImageUrl: legacyImageUrl,
      heroOriginalImageUrl: legacyImageUrl,
      sourceData,
      catalogSections: sampleSiteDraft.catalogSections.map(
        (section, sectionIndex) => ({
          ...section,
          items: section.items.map((item, itemIndex) =>
            sectionIndex === 0 && itemIndex === 0
              ? {
                  ...item,
                  imageUrl: legacyImageUrl,
                  originalImageUrl: legacyImageUrl,
                }
              : item,
          ),
        }),
      ),
    };
    const loaded = projectPublishedSiteVersion({
      vertical: Vertical.RESTAURANT,
      theme: scalar.draftTheme,
      themeVersion: scalar.draftThemeVersion,
      palette: sampleSiteDraft.palette,
      content,
      translations: sampleSiteDraft.translations,
      integrations: sampleSiteDraft.integrations,
      publishedAt: new Date("2026-08-20T00:00:00.000Z"),
    } as PublishedSiteVersionRecord);

    expect(loaded).not.toBeNull();
    expect(loaded?.draft).toMatchObject({
      logoUrl: null,
      faviconUrl: null,
      heroImageUrl: null,
      heroOriginalImageUrl: null,
      sourceData: {
        navigation: [
          {
            label: "Menu",
            url: "/menu",
            destinationUrl: "https://legacy.example/menu",
          },
        ],
        brandAssets: [],
      },
    });
    expect(loaded?.draft.catalogSections[0]?.items[0]).toMatchObject({
      imageUrl: null,
      originalImageUrl: null,
    });
  });

  it("loads a Beauty Site row after removing legacy links and their translated labels", () => {
    const draft = beautyDraft();
    const record = persistedSiteRecord(
      {
        ...draft,
        translations: [
          beautyTranslation([
            "Réserver",
            "Commander",
            "Livraison",
            "Instagram",
          ]),
        ],
        integrations: [
          integration("booking", "Book", "https://booking.example/beauty"),
          integration("ordering", "Order", "https://ordering.example/beauty"),
          integration("delivery", "Delivery", "https://delivery.example/beauty"),
          integration("social", "Instagram", "https://www.instagram.com/beauty"),
        ],
      },
      Vertical.BEAUTY,
    );

    const loaded = projectSiteDraft(record).draft as PersistableSiteDraft;

    expect(loaded.integrations.map(({ type }) => type)).toEqual([
      "booking",
      "social",
    ]);
    expect(loaded.translations).toEqual([
      expect.objectContaining({
        integrationLabels: ["Réserver", "Instagram"],
      }),
    ]);
  });

  it("loads a Food SiteVersion after removing legacy links and their translated labels", () => {
    const legacyIntegrations = [
      ...sampleFoodRetailDraft.integrations,
      integration("quote", "Request quote", "https://food.example/quote"),
      integration("contact", "Contact", "https://food.example/contact"),
    ];
    const translations = sampleFoodRetailDraft.translations.map(
      (translation) => ({
        ...translation,
        integrationLabels: [
          ...translation.integrationLabels,
          "Demander un devis",
          "Contacter",
        ],
      }),
    );
    const scalar = siteDraftScalarData(
      sampleFoodRetailDraft,
      Vertical.FOOD_RETAIL,
    );
    const loaded = projectPublishedSiteVersion({
      vertical: Vertical.FOOD_RETAIL,
      theme: scalar.draftTheme,
      themeVersion: scalar.draftThemeVersion,
      palette: sampleFoodRetailDraft.palette,
      content: sampleFoodRetailDraft,
      translations,
      integrations: legacyIntegrations,
      publishedAt: new Date("2026-08-20T00:00:00.000Z"),
    } as PublishedSiteVersionRecord);

    expect(loaded?.draft.integrations.map(({ type }) => type)).toEqual([
      "ordering",
    ]);
    expect(loaded?.draft.translations).toEqual([
      expect.objectContaining({
        integrationLabels: ["Commander pour retrait"],
      }),
    ]);
  });
});

function beautyDraft() {
  return deterministicDraft(
    {
      source: "Legacy beauty",
      sourceUrl: "https://beauty.example/",
      sourceLocale: "en",
      name: "Legacy Beauty Studio",
      description: "A legacy beauty studio with persisted external links.",
      address: "",
      phone: "",
      email: "",
      heroImageUrl: null,
      pageText: "Legacy Beauty Studio",
      links: [],
    },
    beautyConfig,
  );
}

function beautyTranslation(integrationLabels: string[]) {
  return {
    locale: "fr",
    eyebrow: "Aperçu beauté privé",
    description:
      "Un ancien studio de beauté avec des liens externes enregistrés.",
    attributes: {},
    catalogSections: [
      {
        name: "Services",
        description: "",
        items: [],
      },
    ],
    integrationLabels,
  };
}

function integration(
  type: PersistableSiteDraft["integrations"][number]["type"],
  label: string,
  url: string,
) {
  return { type, label, provider: null, url, enabled: true, venueId: null };
}

function persistedSiteRecord(
  draft: PersistableSiteDraft,
  vertical: Vertical,
): PersistedSiteDraftRecord {
  const scalar = siteDraftScalarData(draft, vertical);
  return {
    ...scalar,
    id: `site_${draft.slug}`,
    slug: draft.slug,
    vertical,
    sourceUrl: draft.sourceUrl,
    draftRevision: 0,
    catalogSections: draft.catalogSections.map((section, sectionIndex) => ({
      id: `section_${sectionIndex}`,
      siteId: `site_${draft.slug}`,
      name: section.name,
      description: section.description,
      position: sectionIndex,
      items: section.items.map((item, itemIndex) => ({
        id: `item_${sectionIndex}_${itemIndex}`,
        sectionId: `section_${sectionIndex}`,
        ...item,
        position: itemIndex,
        imageProvenance: null,
      })),
    })),
    integrations: draft.integrations.map((entry, index) => ({
      id: `integration_${index}`,
      siteId: `site_${draft.slug}`,
      ...entry,
      type: entry.type.toUpperCase(),
      position: index,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  } as unknown as PersistedSiteDraftRecord;
}

function legacySiteRecord(): PersistedSiteDraftRecord {
  const scalar = siteDraftScalarData(sampleSiteDraft, restaurantConfig.id);
  return {
    ...scalar,
    id: "site_legacy",
    slug: "legacy-images",
    vertical: Vertical.RESTAURANT,
    sourceUrl,
    logoUrl: legacyImageUrl,
    faviconUrl: legacyImageUrl,
    heroImageUrl: legacyImageUrl,
    heroOriginalImageUrl: legacyImageUrl,
    sourceData,
    catalogSections: sampleSiteDraft.catalogSections.map(
      (section, sectionIndex) => ({
        id: `section_${sectionIndex}`,
        siteId: "site_legacy",
        name: section.name,
        description: section.description,
        position: sectionIndex,
        items: section.items.map((item, itemIndex) => ({
          id: `item_${sectionIndex}_${itemIndex}`,
          sectionId: `section_${sectionIndex}`,
          name: item.name,
          description: item.description,
          price: item.price,
          currency: item.currency,
          available: item.available,
          attributes: item.attributes,
          imageUrl:
            sectionIndex === 0 && itemIndex === 0
              ? legacyImageUrl
              : item.imageUrl,
          originalImageUrl:
            sectionIndex === 0 && itemIndex === 0
              ? legacyImageUrl
              : item.originalImageUrl,
          imageProvenance: null,
          position: itemIndex,
        })),
      }),
    ),
    integrations: sampleSiteDraft.integrations.map((integration, index) => ({
      id: `integration_${index}`,
      siteId: "site_legacy",
      type: integration.type.toUpperCase(),
      label: integration.label,
      provider: integration.provider,
      url: integration.url,
      enabled: integration.enabled,
      venueId: integration.venueId ?? null,
      position: index,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  } as unknown as PersistedSiteDraftRecord;
}
