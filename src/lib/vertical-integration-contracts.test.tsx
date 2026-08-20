import { afterEach, describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteRenderer } from "@/components/site-renderer";
import {
  deterministicDraft,
  generateSiteDraft,
  type SiteDraftGenerationDependencies,
} from "@/lib/ai/site-generation";
import type { ExtractedSite } from "@/lib/importer";
import type { SiteDraftView } from "@/lib/site-draft";
import { beautyConfig } from "@/lib/verticals/beauty/config";
import { beautyIntegrationSchema } from "@/lib/verticals/beauty/schema";
import { foodRetailConfig } from "@/lib/verticals/food-retail/config";
import { sampleFoodRetailDraft } from "@/lib/verticals/food-retail/fixtures";
import { foodRetailIntegrationSchema } from "@/lib/verticals/food-retail/schema";
import { localServiceConfig } from "@/lib/verticals/local-service/config";
import { localServiceIntegrationSchema } from "@/lib/verticals/local-service/schema";
import { restaurantConfig } from "@/lib/verticals/restaurant/config";
import {
  restaurantIntegrationSchema,
  sampleSiteDraft,
} from "@/lib/verticals/restaurant/schema";
import { selectOwnerRestaurantTheme } from "@/lib/site-themes/restaurant/selection";

const originalKey = process.env.OPENROUTER_API_KEY;
const integration = {
  label: "Unsupported model link",
  provider: null,
  url: "https://unsupported.example/action",
  enabled: true,
  venueId: null,
};
const beautySource: ExtractedSite = {
  source: "Atelier Coupe",
  sourceUrl: "https://atelier-coupe.example/",
  sourceLocale: "en",
  name: "Atelier Coupe",
  description: "A source-backed independent appointment business.",
  address: "",
  phone: "",
  email: "",
  heroImageUrl: null,
  pageText: "Atelier Coupe",
  links: [],
};

afterEach(() => {
  if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalKey;
});

describe("vertical integration contracts", () => {
  it.each([
    [
      restaurantIntegrationSchema,
      restaurantConfig.integrationTypes,
      ["quote", "contact"],
    ],
    [
      beautyIntegrationSchema,
      beautyConfig.integrationTypes,
      ["ordering", "delivery", "quote", "contact"],
    ],
    [
      foodRetailIntegrationSchema,
      foodRetailConfig.integrationTypes,
      ["booking", "quote", "contact"],
    ],
    [
      localServiceIntegrationSchema,
      localServiceConfig.integrationTypes,
      ["ordering", "delivery"],
    ],
  ] as const)(
    "accepts only the integration kinds owned by each vertical",
    (schema, allowed, rejected) => {
      for (const type of allowed) {
        expect(
          schema.safeParse({
            ...integration,
            type,
            url:
              type === "social"
                ? "https://www.instagram.com/source-business/"
                : integration.url,
          }).success,
        ).toBe(true);
      }
      for (const type of rejected) {
        expect(schema.safeParse({ ...integration, type }).success).toBe(false);
      }
    },
  );

  it("rejects a model-authored quote link from model-assisted Beauty generation", async () => {
    process.env.OPENROUTER_API_KEY = "configured-for-adversarial-test";
    const deterministic = deterministicDraft(beautySource, beautyConfig);
    const modelGenerate = mock(async () => ({
      output: {
        ...deterministic,
        integrations: [{ ...integration, type: "quote" }],
      },
    }));

    await expect(
      generateSiteDraft(beautySource, beautyConfig, {
        // This deliberate partial AI SDK result is never persisted: the test
        // exercises the vertical schema that rejects its adversarial output.
        generateText:
          modelGenerate as unknown as
            SiteDraftGenerationDependencies["generateText"],
      }),
    ).rejects.toThrow();
    expect(modelGenerate).toHaveBeenCalledTimes(1);
  });

  it.each([
    [beautyConfig, deterministicDraft(beautySource, beautyConfig), "quote"],
    [foodRetailConfig, sampleFoodRetailDraft, "contact"],
  ] as const)(
    "keeps unsupported links out of shared rendering when parsing is bypassed",
    (config, draft, type) => {
      const adversarial: SiteDraftView = {
        ...draft,
        integrations: [{ ...integration, type }],
      };
      const html = renderToStaticMarkup(
        <SiteRenderer draft={adversarial} vertical={config.id} />,
      );

      expect(html).not.toContain(integration.label);
      expect(html).not.toContain(integration.url);
    },
  );

  it("keeps unsupported links out of the themed Restaurant renderer", () => {
    const selection = selectOwnerRestaurantTheme(
      {
        serviceModel: "full-service",
        primaryIntent: "reserve",
        menuExperience: "editorial",
        brandTraits: ["classic"],
        pricePosition: "midmarket",
        locationCount: 1,
        photographyQuality: "limited",
      },
      "terroir-editorial",
    );
    const adversarial: SiteDraftView = {
      ...sampleSiteDraft,
      attributes: {
        ...sampleSiteDraft.attributes,
        themeSelection: selection,
      },
      integrations: [
        ...sampleSiteDraft.integrations,
        { ...integration, type: "contact" },
      ],
    };

    const html = renderToStaticMarkup(
      <SiteRenderer draft={adversarial} vertical={restaurantConfig.id} />,
    );

    expect(html).toContain('data-site-theme="terroir-editorial"');
    expect(html).not.toContain(integration.label);
    expect(html).not.toContain(integration.url);
  });
});
