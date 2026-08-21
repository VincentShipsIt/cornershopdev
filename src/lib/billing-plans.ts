export const BILLING_PLAN_IDS = ["starter", "growth"] as const;

export type BillingPlanId = (typeof BILLING_PLAN_IDS)[number];

type BillingEnvironment = Record<string, string | undefined>;

export type BillingPlan = {
  id: BillingPlanId;
  priceId: string;
};

export const RESTOFRONT_FOUNDING_PLAN_ID = "starter" as const;
export const RESTOFRONT_FOUNDING_PRICE = {
  currency: "eur",
  unitAmount: 4_900,
  interval: "month",
  intervalCount: 1,
  taxBehavior: "exclusive",
} as const;

export type StripePriceConfiguration = {
  id: string;
  active: boolean;
  currency: string;
  unit_amount: number | null;
  type: string;
  livemode: boolean;
  tax_behavior?: string | null;
  recurring: {
    interval: string;
    interval_count: number;
    usage_type?: string;
  } | null;
  product: string | { active?: boolean; deleted?: boolean | void };
};

export class BillingConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingConfigurationError";
  }
}

export function configuredBillingPlans(
  env: BillingEnvironment = process.env,
): Record<BillingPlanId, BillingPlan> {
  const starter = validatePriceId(
    env.STRIPE_STARTER_PRICE_ID,
    "STRIPE_STARTER_PRICE_ID",
  );
  const growth = validatePriceId(
    env.STRIPE_GROWTH_PRICE_ID,
    "STRIPE_GROWTH_PRICE_ID",
  );
  if (starter === growth) {
    throw new BillingConfigurationError(
      "Starter and Growth must use different Stripe prices",
    );
  }
  return {
    starter: { id: "starter", priceId: starter },
    growth: { id: "growth", priceId: growth },
  };
}

export function billingPlanForPrice(
  priceId: string,
  plans = configuredBillingPlans(),
): BillingPlan | null {
  return Object.values(plans).find((plan) => plan.priceId === priceId) ?? null;
}

export function configuredBillingPriceIds(
  env: BillingEnvironment = process.env,
): Set<string> {
  const current = new Set(
    Object.values(configuredBillingPlans(env)).map((plan) => plan.priceId),
  );
  for (const priceId of (env.STRIPE_LEGACY_PRICE_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)) {
    current.add(validatePriceId(priceId, "STRIPE_LEGACY_PRICE_IDS"));
  }
  return current;
}

/**
 * Stripe IDs alone do not prove the offer. This validates the expanded live
 * resource immediately before Checkout and in the operator preflight so a
 * wrong mode, amount, cadence, tax treatment, or archived Product fails closed.
 */
export function validateRestofrontFoundingPrice(
  price: StripePriceConfiguration,
  input: { expectedPriceId: string; expectedLivemode: boolean },
): void {
  const productActive =
    typeof price.product !== "string" &&
    price.product.active === true &&
    price.product.deleted !== true;
  const recurring = price.recurring;
  const valid =
    price.id === input.expectedPriceId &&
    price.livemode === input.expectedLivemode &&
    price.active &&
    price.type === "recurring" &&
    price.currency.toLowerCase() === RESTOFRONT_FOUNDING_PRICE.currency &&
    price.unit_amount === RESTOFRONT_FOUNDING_PRICE.unitAmount &&
    price.tax_behavior === RESTOFRONT_FOUNDING_PRICE.taxBehavior &&
    recurring?.interval === RESTOFRONT_FOUNDING_PRICE.interval &&
    recurring.interval_count === RESTOFRONT_FOUNDING_PRICE.intervalCount &&
    recurring.usage_type !== "metered" &&
    productActive;
  if (!valid) {
    throw new BillingConfigurationError(
      "The Restofront founding Stripe price does not match the approved offer",
    );
  }
}

export function stripeLivemodeForSecret(
  secret: string | undefined,
): boolean {
  if (secret?.startsWith("sk_live_")) return true;
  if (secret?.startsWith("sk_test_")) return false;
  throw new BillingConfigurationError("STRIPE_SECRET_KEY is not configured");
}

function validatePriceId(
  value: string | undefined,
  variable: string,
): string {
  if (!value?.startsWith("price_") || value.length < 8) {
    throw new BillingConfigurationError(`${variable} is not configured`);
  }
  return value;
}
