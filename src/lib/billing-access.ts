import type { SubscriptionStatus } from "@/generated/prisma/enums";
import { configuredBillingPriceIds } from "@/lib/billing-plans";
import { getDb } from "@/lib/db";

export type BillingAccessRecord = {
  status: SubscriptionStatus;
  stripePriceId: string | null;
  stripeCustomerId: string;
};

export type BillingAccess =
  | {
      ok: true;
      subscription: BillingAccessRecord;
    }
  | {
      ok: false;
      status: 402 | 503;
      code: "BILLING_REQUIRED" | "BILLING_MISCONFIGURED";
      message: string;
      customerPortalAvailable: boolean;
    };

export function evaluateBillingAccess(
  subscription: BillingAccessRecord | null,
  configuredPriceIds: ReadonlySet<string>,
): BillingAccess {
  if (!subscription) {
    return {
      ok: false,
      status: 402,
      code: "BILLING_REQUIRED",
      message: "An active subscription is required",
      customerPortalAvailable: false,
    };
  }
  if (
    subscription.status !== "ACTIVE" ||
    !subscription.stripePriceId ||
    !configuredPriceIds.has(subscription.stripePriceId)
  ) {
    return {
      ok: false,
      status: 402,
      code: "BILLING_REQUIRED",
      message:
        subscription.status === "PAST_DUE"
          ? "Update the payment method to restore publishing"
          : "An active subscription is required",
      customerPortalAvailable: true,
    };
  }
  return { ok: true, subscription };
}

export async function getOrganizationBillingAccess(
  organizationId: string,
): Promise<BillingAccess> {
  let configuredPriceIds: Set<string>;
  try {
    configuredPriceIds = configuredBillingPriceIds();
  } catch {
    return {
      ok: false,
      status: 503,
      code: "BILLING_MISCONFIGURED",
      message: "Billing is temporarily unavailable",
      customerPortalAvailable: false,
    };
  }

  const subscription = await getDb().subscription.findFirst({
    where: { organizationId },
    orderBy: { updatedAt: "desc" },
    select: {
      status: true,
      stripePriceId: true,
      stripeCustomerId: true,
    },
  });
  return evaluateBillingAccess(subscription, configuredPriceIds);
}

export function billingAccessFailureResponse(
  failure: Exclude<BillingAccess, { ok: true }>,
): Response {
  return Response.json(
    {
      error: failure.message,
      code: failure.code,
      customerPortalAvailable: failure.customerPortalAvailable,
    },
    {
      status: failure.status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
