import { createHash } from "node:crypto";
import type Stripe from "stripe";
import {
  configuredBillingPlan,
  FOUNDING_PLAN_ID,
  FOUNDING_PRICE,
  stripeLivemodeForSecret,
  validateFoundingPrice,
} from "@/lib/billing-plans";

type Environment = Record<string, string | undefined>;

export type StripePriceReader = Pick<Stripe, "prices">;

export async function preflightFoundingBilling(input: {
  stripe: StripePriceReader;
  environment?: Environment;
  requiredMode: "test" | "live";
}) {
  const environment = input.environment ?? process.env;
  const expectedLivemode = stripeLivemodeForSecret(
    environment.STRIPE_SECRET_KEY,
  );
  if (expectedLivemode !== (input.requiredMode === "live")) {
    throw new Error(
      "Stripe secret mode does not match the requested environment",
    );
  }
  if (!environment.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_")) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }

  const plan = configuredBillingPlan(environment);
  const price = await input.stripe.prices.retrieve(plan.priceId, {
    expand: ["product"],
  });
  validateFoundingPrice(price, {
    expectedPriceId: plan.priceId,
    expectedLivemode,
  });

  return {
    check: "cornershop-founding-billing",
    ready: true as const,
    mode: input.requiredMode,
    plan: FOUNDING_PLAN_ID,
    amount: FOUNDING_PRICE.unitAmount,
    currency: FOUNDING_PRICE.currency,
    interval: FOUNDING_PRICE.interval,
    taxBehavior: FOUNDING_PRICE.taxBehavior,
    priceFingerprint: createHash("sha256").update(plan.priceId).digest("hex"),
    checkedAt: new Date().toISOString(),
  };
}
