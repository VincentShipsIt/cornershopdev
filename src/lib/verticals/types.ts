import type { z } from "zod";
import type { Vertical } from "@/generated/prisma/enums";
import type { BrandIdentity } from "@/lib/brand";

export type VerticalId = Vertical;

export type CatalogVocabulary = {
  catalog: string;
  section: string;
  item: string;
};

export type IntegrationLinkType =
  "booking" | "ordering" | "delivery" | "social";

/**
 * How a provider's own booking widget is embedded on a generated site.
 *
 * Deliberately iframe-only. Several providers (SevenRooms, Resy, TheFork,
 * Booksy) ship script-tag widgets, and honouring those would mean opening
 * `script-src` to third-party origins on customer-facing pages — which is not
 * worth doing without a full nonce pipeline, and which would weaken the same
 * pages the SSRF-conscious importer is protecting. A frame-only embed keeps the
 * site CSP to a `frame-src` allow-list and leaves Next's inline hydration
 * scripts alone; script-widget providers degrade to a "Book on X" link-out,
 * which is exactly what shipped before this existed.
 */
export type ProviderEmbedDefinition = {
  /** Scheme + host only. Contributes to the site CSP `frame-src` allow-list. */
  origin: string;
  /**
   * The venue/widget id must match this in full before any frame is rendered.
   * Anchor it — a permissive pattern here is the only thing standing between an
   * owner-supplied string and a third-party URL.
   */
  idPattern: RegExp;
  /** Recovers the venue id from a booking URL the importer already found. */
  extractVenueId?: (url: string) => string | null;
  /** Builds the iframe src from an id that has already matched `idPattern`. */
  buildSrc: (venueId: string) => string;
  /** Rendered frame height in px; provider widgets do not self-size. */
  height: number;
};

export type ProviderDefinition = {
  name: string;
  pattern: RegExp;
  /** Anchored allow-list used for owner-edited URLs; never match free-form paths. */
  hostnamePattern?: RegExp;
  type: IntegrationLinkType;
  classificationPattern?: RegExp;
  embed?: ProviderEmbedDefinition;
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

/**
 * The closed set of glyphs a marketing block may ask for. A union rather than a
 * component reference so vertical configs stay plain data — they are imported by
 * the crawler, the prompt builder and the API routes, none of which should pull
 * a React icon into their bundle. `src/app/niche/[vertical]/page.tsx` owns the
 * mapping, so an unmapped name is a build error rather than a blank square.
 */
export type MarketingIconName =
  "catalog" | "imagery" | "booking" | "refresh" | "shield" | "cursor";

export type MarketingPlan = {
  name: string;
  price: string;
  cadence: string;
  copy: string;
  features: string[];
  /** Exactly one plan per vertical should set this; it renders inverted. */
  featured?: boolean;
  badge?: string;
};

/** At least one public plan. A vertical may sell a single featured founding offer. */
export type MarketingPlans = [MarketingPlan, ...MarketingPlan[]];

/**
 * Everything a niche's own marketing site prints. The whole point is that a new
 * niche domain — nails, barbers, dog grooming — is a config entry and a DNS
 * record, never a new route: `proxy.ts` maps `hostnames` to the vertical, and
 * the shared niche page renders this block and nothing else. Copy lives here
 * rather than in the page because the page must never learn what a restaurant
 * is, for the same reason the renderer never does.
 */
export type VerticalMarketing = {
  /**
   * Hostnames whose `/` serves this niche's marketing site. Empty is meaningful
   * and supported: the vertical is built and sellable, it simply has no domain
   * yet, so the factory homepage lists it while `proxy.ts` never matches it.
   */
  hostnames: string[];
  /** Bare domain printed as the niche's public identity, or null while unlaunched. */
  domain: string | null;
  brand: BrandIdentity;
  /**
   * The address this niche's mail goes out as, and where a reply to it lands.
   * Every customer arrives through a niche storefront, so every customer email
   * is a niche email: a restaurant that bought Restofrontapp must never receive a
   * sign-in link from a factory address it has never heard of.
   *
   * Null until the niche's sending domain is verified with the mail provider.
   * That is not a soft default — a niche cannot send as a domain it does not
   * own, and borrowing a launched niche's address would put Restofrontapp's name
   * on a salon's mail. So this gates launch alongside `domain`: a niche is
   * live when it has both, and until then `EMAIL_FROM` covers the stragglers.
   */
  email: { from: string; replyTo: string } | null;
  /** Plural noun for the businesses served: "restaurants", "salons and barbers". */
  audience: string;
  /** One line under the niche's name on the factory homepage. */
  tagline: string;
  /**
   * Restaurant ships a bespoke before/after mock; a niche without one gets the
   * plain hero rather than a restaurant visual with its labels swapped.
   */
  heroVisual: "transformation" | "none";
  hero: {
    badge: string;
    headline: string;
    subheadline: string;
    proofPoints: string[];
  };
  /** Wording around the source input, so a salon is never asked for a restaurant. */
  form: {
    placeholder: string;
    label: string;
    submitLabel: string;
    pendingLabel: string;
  };
  /** Host-specific copy for the shared passwordless customer workspace. */
  signIn: {
    title: string;
    description: string;
    emailPlaceholder: string;
    emptyPrompt: string;
    createLabel: string;
    createHref: string;
  };
  /** Optional public library powered by the vertical's registered site themes. */
  themeGallery?: { href: string; label: string };
  steps: { number: string; title: string; copy: string }[];
  valueProps: {
    eyebrow: string;
    headline: string;
    copy: string;
    items: { icon: MarketingIconName; title: string; copy: string }[];
  };
  imagery: {
    imageUrl: string;
    imageAlt: string;
    eyebrow: string;
    headline: string;
    copy: string;
    assurances: { icon: MarketingIconName; copy: string }[];
  };
  pricing: {
    eyebrow: string;
    headline: string;
    copy: string;
    /**
     * A vertical may sell one featured founding plan. Do not pad a dummy
     * second tier just to fill a two-column grid.
     */
    plans: MarketingPlans;
  };
  closing: { headline: string; copy: string };
  footerTagline: string;
};

export type VerticalConfig<
  TAttributes extends Record<string, unknown> = Record<string, unknown>,
  TItemAttributes extends Record<string, unknown> = Record<string, unknown>,
  TTemplate extends VerticalTemplateDefinition = VerticalTemplateDefinition,
  TDraft = unknown,
> = {
  id: VerticalId;
  vocabulary: CatalogVocabulary;
  /** The niche's own marketing site. See `VerticalMarketing`. */
  marketing: VerticalMarketing;
  attributesSchema: z.ZodType<TAttributes>;
  attributeDefaults: TAttributes;
  /** Optional richer defaults used only for a brand-new non-AI import. */
  deterministicAttributes?: TAttributes;
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
