import { Vertical } from "@/generated/prisma/enums";
import { localServiceMarketing } from "@/lib/verticals/local-service/marketing";
import { localServicePrompt } from "@/lib/verticals/local-service/prompt";
import {
  localServiceLinkKeywordHints,
  localServiceProviders,
  localServiceRelevantPathPattern,
} from "@/lib/verticals/local-service/providers";
import {
  localServiceAttributesSchema,
  localServiceItemAttributesSchema,
  localServiceSiteDraftSchema,
  type LocalServiceAttributes,
  type LocalServiceItemAttributes,
  type LocalServiceSiteDraft,
  type LocalServiceTradeType,
} from "@/lib/verticals/local-service/schema";
import {
  localServiceTemplates,
  resolveLocalServiceTemplateFromAttributes,
  type LocalServiceTemplate,
} from "@/lib/verticals/local-service/templates";
import type { VerticalConfig } from "@/lib/verticals/types";

const tradeLabels: Record<LocalServiceTradeType, string> = {
  plumber: "Plumber",
  electrician: "Electrician",
  builder: "Builder",
  repair: "Repair specialist",
  artisan: "Artisan",
  "general-trades": "Local trade",
};

const availabilityLabels: Record<
  LocalServiceAttributes["availabilityPosture"],
  string | null
> = {
  "not-stated": null,
  scheduled: "Scheduled work",
  "same-day": "Same-day availability stated",
  "emergency-callout": "Emergency callouts stated",
  "24-7-emergency": "24/7 emergency service stated",
  "by-appointment": "By appointment",
};

export const localServiceDictionaryExtensions = {
  en: {
    language: "Language",
    reservationsVia: "Contact via",
    bookingPartner: "our scheduling partner",
    seasonalNotice: "Service coverage and availability may change. Confirm before booking work.",
    heroImageAlt: "Work by",
    bookingHeading: "Contact",
    bookingRequestHeading: "Request the work",
    bookingRequestIntro: "Use the listed phone, WhatsApp or quote tool to describe the job.",
    serviceAreasHeading: "Service areas",
    credentialsHeading: "Credentials and cover",
    trustHeading: "Why customers call",
    projectsHeading: "Completed projects",
  },
} satisfies Record<string, Record<string, string>>;

const attributeDefaults: LocalServiceAttributes = {
  tradeType: "general-trades",
  availabilityPosture: "not-stated",
  serviceAreas: [],
  credentials: [],
  insuranceStatus: "not-stated",
  insuranceDetail: "",
  trustSignals: [],
  projects: [],
  showProjectGallery: true,
};

export const localServiceConfig = {
  id: Vertical.LOCAL_SERVICE,
  vocabulary: { catalog: "Services", section: "Service group", item: "Service" },
  marketing: localServiceMarketing,
  attributesSchema: localServiceAttributesSchema,
  attributeDefaults,
  deterministicAttributes: attributeDefaults,
  itemAttributesSchema: localServiceItemAttributesSchema,
  itemAttributeDefaults: {
    pricingModel: "not-stated",
    priceUnit: "",
    emergencyEligible: false,
  },
  draftSchema: localServiceSiteDraftSchema,
  prompt: localServicePrompt,
  imageEnhancement: {
    subject: "local-service project photograph",
    contextLabel: "Trade business",
    forbiddenElements:
      "completed work, wiring, pipework, joinery, finish, defect, damage, safety equipment, credential, certification mark",
    sceneClause: "make unfinished work look complete or make the job look like a different trade",
    fidelityClause: "the condition, quality, safety or outcome of the work actually shown",
    gradeClause:
      "Use a neutral documentary colour grade. Avoid fake before-and-after contrast, removed defects, fabricated finishes, exaggerated sharpness, artificial dust or sparks, and stock-photo polish.",
  },
  presentation: {
    fallbackDescription:
      "An independent local trade providing clearly described services and a direct way to request the work.",
    fallbackPalette: {
      background: "#f3f1ec",
      foreground: "#18201d",
      accent: "#c6532d",
    },
    buildEyebrow: (attributes, site) =>
      `${tradeLabels[attributes.tradeType]} · ${site.address ?? "Local"}`,
    itemBadges: (attributes) => {
      const badges: string[] = [];
      if (attributes.pricingModel === "quote") badges.push("Quote required");
      if (attributes.pricingModel === "from") badges.push("From");
      if (attributes.pricingModel === "hourly") {
        badges.push(attributes.priceUnit || "Hourly");
      } else if (attributes.priceUnit) badges.push(attributes.priceUnit);
      if (attributes.emergencyEligible) badges.push("Emergency callout");
      return badges;
    },
    businessDetails: (attributes) => ({
      availability: availabilityLabels[attributes.availabilityPosture],
      serviceAreas: attributes.serviceAreas,
      credentials: attributes.credentials.map((credential) =>
        [credential.name, credential.issuer, credential.reference]
          .filter(Boolean)
          .join(" · "),
      ),
      trustSignals: [
        ...(attributes.insuranceStatus === "insured"
          ? [attributes.insuranceDetail || "Insurance stated by the business"]
          : attributes.insuranceStatus === "not-insured"
            ? ["Business states that it is not insured"]
            : []),
        ...attributes.trustSignals.map((signal) =>
          [signal.label, signal.detail].filter(Boolean).join(" · "),
        ),
      ],
      projects: attributes.projects.map((project) => ({
        title: project.title,
        description: project.description,
        imageUrl: project.imageUrl,
        location: project.location,
      })),
    }),
  },
  templates: {
    definitions: localServiceTemplates,
    resolve: resolveLocalServiceTemplateFromAttributes,
  },
  normalizeGeneratedAttributes: (attributes, template) => ({
    ...attributes,
    showProjectGallery:
      attributes.projects.length > 0 &&
      (attributes.showProjectGallery || template.showProjectImagesByDefault),
  }),
  providers: localServiceProviders,
  crawl: {
    relevantPathPattern: localServiceRelevantPathPattern,
    linkKeywordHints: localServiceLinkKeywordHints,
  },
  i18n: localServiceDictionaryExtensions,
  rendererCapabilities: (attributes) => ({
    showGallery: attributes.showProjectGallery,
    bookingRequestForm: "never",
  }),
} satisfies VerticalConfig<
  LocalServiceAttributes,
  LocalServiceItemAttributes,
  LocalServiceTemplate,
  LocalServiceSiteDraft
>;
