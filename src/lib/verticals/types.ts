import type { z } from "zod";
import type { Vertical } from "@/generated/prisma/enums";

export type VerticalId = Vertical;

export type CatalogVocabulary = {
  catalog: string;
  section: string;
  item: string;
};

export type IntegrationLinkType =
  | "booking"
  | "ordering"
  | "delivery"
  | "social";

export type ProviderDefinition = {
  name: string;
  pattern: RegExp;
  type: IntegrationLinkType;
  classificationPattern?: RegExp;
};

/**
 * Copy the shared renderer prints around the catalog. Every vertical phrases
 * these differently — a menu is not a service list — but the slots are the same,
 * so the renderer reads them positionally and never learns which vertical wrote
 * them. Keyed by UI locale; resolution falls back locale → language → `en`.
 */
export type VerticalTemplateCopy = {
  catalogEyebrow: string;
  catalogHeading: string;
  featuredHeading: string;
  featuredSubheading: string;
};

/**
 * The layout contract between a vertical's template set and the shared renderer:
 * exactly the primitives the renderer branches on. Anything a vertical needs
 * beyond them — restaurant's `showMenuImagesByDefault`, for instance — stays on
 * that vertical's own template type and never reaches the renderer.
 */
export type VerticalTemplateDefinition = {
  id: string;
  heroLayout: "split" | "immersive" | "card";
  catalogLayout: "stack" | "columns" | "cards";
  brandClassName: string;
  titleClassName: string;
  sectionClassName: string;
  copy: Record<string, VerticalTemplateCopy>;
};

export type LinkClassificationHint = {
  type: IntegrationLinkType;
  pattern: RegExp;
};

export type VerticalConfig<
  TAttributes extends Record<string, unknown> = Record<string, unknown>,
  TItemAttributes extends Record<string, unknown> = Record<string, unknown>,
  TTemplate extends VerticalTemplateDefinition = VerticalTemplateDefinition,
  TDraft = unknown,
> = {
  id: VerticalId;
  vocabulary: CatalogVocabulary;
  attributesSchema: z.ZodType<TAttributes>;
  attributeDefaults: TAttributes;
  itemAttributesSchema: z.ZodType<TItemAttributes>;
  itemAttributeDefaults: TItemAttributes;
  draftSchema: z.ZodType<TDraft>;
  prompt: {
    roleFraming: string;
    extractionRules: string;
    classificationVocabulary: string;
  };
  // Photo faithfulness is a shared skeleton, but the elements a model must never
  // regenerate are vertical-specific: food/plating for restaurants, skin/hair/nail
  // and treatment results for beauty, where altering them misrepresents an outcome.
  imageEnhancement: {
    subject: string;
    contextLabel: string;
    forbiddenElements: string;
    sceneClause: string;
    fidelityClause: string;
    gradeClause: string;
  };
  // Copy the read path substitutes when a stored site is missing optional columns,
  // plus the vertical's own way of phrasing the hero eyebrow from its attribute bag.
  presentation: {
    fallbackDescription: string;
    fallbackPalette: { background: string; foreground: string; accent: string };
    // `address` is nullable rather than defaulted so a vertical can distinguish an
    // absent address from an empty one.
    buildEyebrow: (
      attributes: TAttributes,
      site: { address: string | null },
    ) => string;
    // Short pills printed under a catalog item. Restaurants surface dietary
    // labels here, beauty surfaces duration or "with any stylist" — the renderer
    // only ever sees strings, which is what keeps `dietaryLabels` out of it.
    itemBadges?: (attributes: TItemAttributes) => string[];
  };
  templates: {
    definitions: Record<string, TTemplate>;
    resolve: (attributes: TAttributes) => TTemplate;
  };
  normalizeGeneratedAttributes?: (
    attributes: TAttributes,
    template: TTemplate,
  ) => TAttributes;
  providers: ProviderDefinition[];
  crawl: {
    relevantPathPattern: RegExp;
    linkKeywordHints: LinkClassificationHint[];
  };
  i18n: Record<string, Record<string, string>>;
  rendererCapabilities: (attributes: TAttributes) => {
    showGallery: boolean;
    showBookingRequestForm: boolean;
  };
};
