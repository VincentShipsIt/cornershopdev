import type { SubscriptionStatus } from "@/generated/prisma/enums";
import { configuredBillingPriceId } from "@/lib/billing-plans";
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
  configuredPriceId: string,
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
    subscription.stripePriceId !== configuredPriceId
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

export async function getSiteBillingAccess(
  siteId: string,
): Promise<BillingAccess> {
  let configuredPriceId: string;
  try {
    configuredPriceId = configuredBillingPriceId();
  } catch {
    return {
      ok: false,
      status: 503,
      code: "BILLING_MISCONFIGURED",
      message: "Billing is temporarily unavailable",
      customerPortalAvailable: false,
    };
  }

  const subscription = await getDb().subscription.findUnique({
    where: { siteId },
    select: {
      status: true,
      stripePriceId: true,
      stripeCustomerId: true,
    },
  });
  return evaluateBillingAccess(subscription, configuredPriceId);
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
