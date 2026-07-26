import type Stripe from "stripe";
import type { SubscriptionStatus } from "@/generated/prisma/enums";

export type StripeSubscriptionSnapshot = {
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId: string | null;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

export function mapStripeSubscriptionStatus(
  status: Stripe.Subscription.Status,
): SubscriptionStatus {
  switch (status) {
    case "active":
    case "trialing":
      return "ACTIVE";
    case "incomplete":
    case "incomplete_expired":
      return "INCOMPLETE";
    case "past_due":
    case "unpaid":
    case "paused":
      return "PAST_DUE";
    case "canceled":
      return "CANCELED";
  }
}

export function stripeSubscriptionSnapshot(
  subscription: Stripe.Subscription,
): StripeSubscriptionSnapshot {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  const items = subscription.items.data;
  const priceIds = new Set(items.map((item) => item.price.id));
  const currentPeriodEnds = items
    .map((item) => item.current_period_end)
    .filter((value): value is number => Number.isFinite(value));

  return {
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    stripePriceId: priceIds.size === 1 ? [...priceIds][0] : null,
    status: mapStripeSubscriptionStatus(subscription.status),
    currentPeriodEnd:
      currentPeriodEnds.length > 0
        ? new Date(Math.min(...currentPeriodEnds) * 1000)
        : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  };
}
