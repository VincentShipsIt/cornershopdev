import type { VerticalId } from "@/lib/verticals/types";

/**
 * A topic plan names a reusable angle an article can take for a site. The key
 * is stable across sites and batches so the dedupe pass can tell "the same
 * slot refilled" from "a new angle"; the title is the working headline the
 * composer hands the model; `requiredFacts` names site data the article may
 * only exist if the site actually carries — a neighbourhood guide with no
 * address is exactly the generic filler this engine exists to prevent.
 */
export type ArticleTopicPlan = {
  key: string;
  title: string;
  requiredFacts: ArticleFactKey[];
};

/**
 * The site facts a topic may draw on. Each maps to a field the composer
 * extracts from the live draft snapshot; a topic whose facts are all absent
 * can never be selected.
 */
export type ArticleFactKey =
  | "catalogItems"
  | "address"
  | "businessHours"
  | "phone"
  | "integrations";

const RESTAURANT_TOPICS: ArticleTopicPlan[] = [
  {
    key: "seasonal-menu",
    title: "What's in season on our menu right now",
    requiredFacts: ["catalogItems"],
  },
  {
    key: "neighbourhood-guide",
    title: "Where to find us and what else is nearby",
    requiredFacts: ["address"],
  },
  {
    key: "private-events",
    title: "Booking us for private events and group tables",
    requiredFacts: ["phone", "integrations"],
  },
  {
    key: "dietary-faqs",
    title: "Eating with dietary needs: what we can do",
    requiredFacts: ["catalogItems"],
  },
  {
    key: "chef-story",
    title: "How we cook: our kitchen, our suppliers",
    requiredFacts: ["catalogItems"],
  },
];

const BEAUTY_TOPICS: ArticleTopicPlan[] = [
  {
    key: "treatment-explainers",
    title: "Our treatments explained: what to expect",
    requiredFacts: ["catalogItems"],
  },
  {
    key: "aftercare",
    title: "Aftercare: keeping your results longer",
    requiredFacts: ["catalogItems"],
  },
  {
    key: "trends",
    title: "What we're seeing in the chair this season",
    requiredFacts: ["catalogItems"],
  },
  {
    key: "first-visit",
    title: "Your first visit: how an appointment runs",
    requiredFacts: ["businessHours", "address"],
  },
];

const LOCAL_SERVICE_TOPICS: ArticleTopicPlan[] = [
  {
    key: "service-walkthrough",
    title: "What happens when you book us",
    requiredFacts: ["catalogItems"],
  },
  {
    key: "coverage-area",
    title: "Where we work: our coverage area",
    requiredFacts: ["address"],
  },
  {
    key: "quote-guide",
    title: "Getting a quote: what we need to know",
    requiredFacts: ["phone", "integrations"],
  },
];

const FOOD_RETAIL_TOPICS: ArticleTopicPlan[] = [
  {
    key: "sourcing-story",
    title: "Where our shelves come from",
    requiredFacts: ["catalogItems"],
  },
  {
    key: "seasonal-stock",
    title: "In store this season",
    requiredFacts: ["catalogItems"],
  },
  {
    key: "ordering-options",
    title: "Ways to shop with us",
    requiredFacts: ["integrations"],
  },
];

/**
 * Per-vertical topic plans. A vertical registers here when it wants the
 * content engine; an unlisted vertical has no plans and generation refuses,
 * which keeps a half-configured niche from emitting filler.
 */
const TOPIC_PLANS: Partial<Record<VerticalId, ArticleTopicPlan[]>> = {
  RESTAURANT: RESTAURANT_TOPICS,
  BEAUTY: BEAUTY_TOPICS,
  LOCAL_SERVICE: LOCAL_SERVICE_TOPICS,
  FOOD_RETAIL: FOOD_RETAIL_TOPICS,
};

export function articleTopicPlansFor(vertical: VerticalId): ArticleTopicPlan[] {
  return TOPIC_PLANS[vertical] ?? [];
}

export function articleTopicPlanByKey(
  vertical: VerticalId,
  key: string,
): ArticleTopicPlan | null {
  return articleTopicPlansFor(vertical).find((plan) => plan.key === key) ?? null;
}
