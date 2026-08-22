import type {
  SiteStatus,
  SubscriptionStatus,
} from "@/generated/prisma/enums";
import {
  billingPlanForPrice,
  configuredBillingPlan,
  type BillingPlanId,
} from "@/lib/billing-plans";

const DAY_MS = 24 * 60 * 60_000;

export type MonitoringEntitlement =
  | { active: true; plan: BillingPlanId; cadenceDays: 30 }
  | {
      active: false;
      reason:
        | "NO_SUBSCRIPTION"
        | "INACTIVE_SUBSCRIPTION"
        | "PAUSED_SITE"
        | "UNKNOWN_PLAN";
    };

export function monitoringEntitlement(
  input: {
    status: SubscriptionStatus | null;
    stripePriceId: string | null;
    siteStatus: SiteStatus;
  },
  env: Record<string, string | undefined> = process.env,
): MonitoringEntitlement {
  if (!input.status || !input.stripePriceId) {
    return { active: false, reason: "NO_SUBSCRIPTION" };
  }
  if (input.status !== "ACTIVE") {
    return { active: false, reason: "INACTIVE_SUBSCRIPTION" };
  }
  if (input.siteStatus === "PAUSED") {
    return { active: false, reason: "PAUSED_SITE" };
  }

  let plan;
  try {
    plan = billingPlanForPrice(
      input.stripePriceId,
      configuredBillingPlan(env),
    );
  } catch {
    plan = null;
  }
  if (!plan) return { active: false, reason: "UNKNOWN_PLAN" };
  return {
    active: true,
    plan: plan.id,
    cadenceDays: 30,
  };
}

export function nextMonitoringTime(
  scheduledFor: Date,
  cadenceDays: number,
  now = new Date(),
): Date {
  let next = new Date(scheduledFor.getTime() + cadenceDays * DAY_MS);
  while (next <= now) {
    next = new Date(next.getTime() + cadenceDays * DAY_MS);
  }
  return next;
}

export function monitoringIdempotencyKey(
  siteId: string,
  scheduledFor: Date,
): string {
  return `${siteId}:${scheduledFor.toISOString()}`;
}
