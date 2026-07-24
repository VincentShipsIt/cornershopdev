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

export type VerticalTemplateDefinition = {
  id: string;
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
