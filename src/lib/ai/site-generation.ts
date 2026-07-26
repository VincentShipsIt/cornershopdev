import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, Output } from "ai";
import type { ExtractedSite } from "@/lib/importer";
import { slugify } from "@/lib/restaurant";
import type {
  VerticalConfig,
  VerticalTemplateDefinition,
} from "@/lib/verticals/types";

type SiteDraftShape<
  TAttributes extends Record<string, unknown>,
  TItemAttributes extends Record<string, unknown>,
> = {
  slug: string;
  name: string;
  eyebrow: string;
  description: string;
  address: string;
  phone: string;
  sourceUrl: string | null;
  heroImageUrl: string | null;
  heroOriginalImageUrl?: string | null;
  heroImageProvenance?: "official" | "owner" | "permissioned-ugc" | null;
  palette: {
    background: string;
    foreground: string;
    accent: string;
  };
  attributes: TAttributes;
  autoEnhanceImages: boolean;
  defaultLocale: string;
  translations: Array<{
    integrationLabels: string[];
  }>;
  catalogSections: Array<{
    items: Array<{
      attributes: TItemAttributes;
      imageUrl: string | null;
      originalImageUrl?: string | null;
      imageProvenance?: "official" | "owner" | "permissioned-ugc" | null;
    }>;
  }>;
  integrations: ExtractedSite["links"];
};

type PromptVerticalConfig = Pick<
  VerticalConfig,
  "prompt" | "vocabulary"
>;

type ImagePromptVerticalConfig = Pick<VerticalConfig, "imageEnhancement">;

export const SHARED_SKELETON = `Rules:
- Never invent booking, ordering, delivery, address, phone, opening-hour, availability, allergen, service, or price facts.
- Existing booking, ordering, and delivery systems must remain external links; do not rename their providers.
- Preserve all factual catalog entries and prices that can be recovered.
- Set defaultLocale to the canonical source locale using a two-letter language code.
- When the canonical locale is not English, include one complete "en" translation. When it is English, do not duplicate it in translations.
- A translation is a linguistic overlay only: its catalog sections, items and integrationLabels must have exactly the same order and counts as the canonical data.
- Never invent catalog items. If catalog data is incomplete, return an empty catalog section with a factual explanation.
- Return three accessible hex colours in palette, derived from the source website's visible branding and photography rather than a generic palette.
- Preserve sourceUrl and heroImageUrl exactly as instructed.`;

/**
 * OpenRouter is the only model provider. Text and image generation share one
 * key, so a single predicate gates both — callers degrade gracefully (text
 * falls back to `deterministicDraft`, image enhancement is skipped) rather
 * than failing the import.
 */
export function aiIsConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

function getOpenRouter() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");
  return createOpenRouter({
    apiKey,
    compatibility: "strict",
    headers: {
      "HTTP-Referer":
        process.env.NEXT_PUBLIC_APP_URL ?? "https://cornershop.dev",
      "X-Title": "Cornershopdev",
    },
  });
}

/**
 * Every request carries a customer's own website content, so routing is
 * restricted to providers that neither retain nor train on the prompt.
 * `require_parameters` keeps that restriction honest: a provider that cannot
 * honour the routing preferences is skipped rather than silently substituted.
 */
const PRIVATE_ROUTING = {
  require_parameters: true,
  data_collection: "deny",
} as const;

function getTextModel() {
  return getOpenRouter().chat(
    process.env.OPENROUTER_TEXT_MODEL ?? "openrouter/auto",
    {
      extraBody: {
        provider: PRIVATE_ROUTING,
        plugins: [{ id: "response-healing" }],
      },
      usage: { include: true },
    },
  );
}

/**
 * Image-output models are ordinary chat models on OpenRouter: the generated
 * image comes back in `choices[].message.images[]`, which the provider maps
 * onto AI SDK file parts. `modalities` is what opts the response into that.
 *
 * `require_parameters` matters more here than for text: a provider that drops
 * `modalities` answers with prose, and `enhanceSiteImage` then throws on a
 * missing file part. Skipping such a provider turns a confusing failure into
 * the caller's existing "enhancement unavailable" path.
 */
function getImageModel() {
  return getOpenRouter().chat(
    process.env.OPENROUTER_IMAGE_MODEL ??
      "google/gemini-3.1-flash-image",
    {
      extraBody: {
        modalities: ["image", "text"],
        provider: PRIVATE_ROUTING,
      },
      usage: { include: true },
    },
  );
}

export function deterministicDraft<
  TAttributes extends Record<string, unknown>,
  TItemAttributes extends Record<string, unknown>,
  TTemplate extends VerticalTemplateDefinition,
  TDraft extends SiteDraftShape<TAttributes, TItemAttributes>,
>(
  source: ExtractedSite,
  vertical: VerticalConfig<TAttributes, TItemAttributes, TTemplate, TDraft>,
): TDraft {
  const name = source.name || source.source;
  const verticalName = vertical.id.toLowerCase();
  const description =
    source.description ||
    `A private first look created from the ${verticalName} information currently available.`;
  return vertical.draftSchema.parse({
    slug: slugify(name) || `${verticalName}-preview`,
    name,
    eyebrow: `Private ${verticalName} preview`,
    description,
    address: source.address,
    phone: source.phone,
    sourceUrl: source.sourceUrl,
    heroImageUrl: source.heroImageUrl,
    heroOriginalImageUrl: source.heroImageUrl,
    heroImageProvenance: source.heroImageUrl ? "official" : null,
    palette: {
      background: "#f4efe5",
      foreground: "#1d241f",
      accent: "#a5482d",
    },
    attributes:
      vertical.deterministicAttributes ?? vertical.attributeDefaults,
    autoEnhanceImages: false,
    defaultLocale: source.sourceLocale ?? "en",
    translations: [],
    catalogSections: [
      {
        name: vertical.vocabulary.catalog,
        description: `${vertical.vocabulary.catalog} details were not available for automatic structuring.`,
        items: [],
      },
    ],
    integrations: source.links,
  });
}

export function composePrompt(
  source: ExtractedSite,
  vertical: PromptVerticalConfig,
): string {
  return `${vertical.prompt.roleFraming}

${SHARED_SKELETON}
${vertical.prompt.extractionRules}

Classification vocabulary:
${vertical.prompt.classificationVocabulary}

- Treat ${source.sourceLocale ?? "the detected source language"} as the canonical locale and put the source wording in the main fields.
- sourceUrl must be ${source.sourceUrl ?? "null"}.
- heroImageUrl must be ${source.heroImageUrl ?? "null"}.

Known business:
${JSON.stringify({
  name: source.name,
  description: source.description,
  address: source.address,
  phone: source.phone,
  sourceLocale: source.sourceLocale,
  links: source.links,
})}

Website text collected from the homepage and relevant same-origin pages:
${source.pageText.slice(0, 60_000)}`;
}

export async function generateSiteDraft<
  TAttributes extends Record<string, unknown>,
  TItemAttributes extends Record<string, unknown>,
  TTemplate extends VerticalTemplateDefinition,
  TDraft extends SiteDraftShape<TAttributes, TItemAttributes>,
>(
  source: ExtractedSite,
  vertical: VerticalConfig<TAttributes, TItemAttributes, TTemplate, TDraft>,
): Promise<TDraft> {
  if (!aiIsConfigured()) return deterministicDraft(source, vertical);

  const { output } = await generateText({
    model: getTextModel(),
    output: Output.object({
      schema: vertical.draftSchema,
      name: `${vertical.id.toLowerCase()}_website_draft`,
      description: `A faithful structured business website and ${vertical.vocabulary.catalog.toLowerCase()} draft extracted from source material.`,
    }),
    maxRetries: 2,
    timeout: { totalMs: 55_000, stepMs: 45_000 },
    prompt: composePrompt(source, vertical),
  });

  const attributes = vertical.attributesSchema.parse(output.attributes);
  const template = vertical.templates.resolve(attributes);
  const normalizedAttributes = vertical.normalizeGeneratedAttributes
    ? vertical.normalizeGeneratedAttributes(attributes, template)
    : attributes;
  return vertical.draftSchema.parse({
    ...output,
    slug: slugify(output.name),
    sourceUrl: source.sourceUrl,
    heroImageUrl: source.heroImageUrl,
    heroOriginalImageUrl: source.heroImageUrl,
    heroImageProvenance: source.heroImageUrl ? "official" : null,
    attributes: normalizedAttributes,
    autoEnhanceImages: true,
    catalogSections: output.catalogSections.map((section) => ({
      ...section,
      items: section.items.map((item) => ({
        ...item,
        imageUrl: null,
        originalImageUrl: null,
        imageProvenance: null,
      })),
    })),
    integrations:
      source.links.length > 0 ? source.links : output.integrations,
    translations: output.translations.map((translation) => ({
      ...translation,
      integrationLabels:
        source.links.length > 0
          ? source.links.map(
              (link, index) =>
                translation.integrationLabels[index] ?? link.label,
            )
          : translation.integrationLabels,
    })),
  });
}

export type SiteImageEnhancementRequest = {
  sourceImageUrl: string;
  siteName?: string;
  enhancementNotes?: string;
};

function parseSourceImageUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("The source image must use HTTPS");
  }
  return url;
}

export async function enhanceSiteImage(
  request: SiteImageEnhancementRequest,
  vertical: ImagePromptVerticalConfig,
): Promise<{
  data: Uint8Array;
  mediaType: string;
}> {
  if (!aiIsConfigured()) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const enhancement = vertical.imageEnhancement;
  const sourceImage = parseSourceImageUrl(request.sourceImageUrl);
  const context = request.siteName
    ? `${enhancement.contextLabel}: ${request.siteName}.`
    : "";
  const notes = request.enhancementNotes
    ? `Requested finishing notes: ${request.enhancementNotes}`
    : "";
  const result = await generateText({
    model: getImageModel(),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Edit this exact ${enhancement.subject}. The result must remain a faithful record of the source image.

Allowed changes: correct exposure and white balance, recover highlights and shadows, reduce noise, improve sharpness and resolution, straighten, crop subtly, and remove only transient non-material distractions such as sensor dust.

Forbidden changes: do not add, remove, replace, move, restyle, or regenerate any ${enhancement.forbiddenElements}, furniture, architecture, logo, person, or material background element. Do not change camera geometry or ${enhancement.sceneClause}. If a requested adjustment would change ${enhancement.fidelityClause}, leave it unchanged.

${enhancement.gradeClause} Return one enhanced image and no text.

${context}
${notes}`,
          },
          { type: "image", image: sourceImage },
        ],
      },
    ],
    timeout: { totalMs: 60_000 },
    experimental_include: {
      requestBody: false,
      responseBody: false,
    },
  });

  const image = result.files.find((file) =>
    file.mediaType?.startsWith("image/"),
  );
  if (!image) throw new Error("The image model returned no enhanced image");

  return {
    data: image.uint8Array,
    mediaType: image.mediaType ?? "image/png",
  };
}
