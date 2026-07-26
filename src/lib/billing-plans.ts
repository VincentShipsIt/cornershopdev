export const BILLING_PLAN_IDS = ["starter", "growth"] as const;

export type BillingPlanId = (typeof BILLING_PLAN_IDS)[number];

type BillingEnvironment = Record<string, string | undefined>;

export type BillingPlan = {
  id: BillingPlanId;
  priceId: string;
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
  return new Set(
    Object.values(configuredBillingPlans(env)).map((plan) => plan.priceId),
  );
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
