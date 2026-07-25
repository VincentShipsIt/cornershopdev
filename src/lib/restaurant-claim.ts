import type { Prisma } from "@/generated/prisma/client";
import { RestaurantStatus } from "@/generated/prisma/enums";

/**
 * A restaurant may only be claimed while it is still an unowned prospect.
 * Once it belongs to an organization, only that organization may act on it —
 * a completed checkout must never be able to reassign somebody else's
 * restaurant just because the caller supplied its slug.
 *
 * Mirrors the equivalent guard on the import path in
 * `restaurant-import-persistence.ts`, which the claim path was missing.
 */
export const CLAIMABLE_STATUSES: RestaurantStatus[] = [
  RestaurantStatus.PROSPECT,
  RestaurantStatus.PREVIEW_READY,
];

/**
 * Raised when a checkout tries to claim a restaurant that is missing or is
 * already owned by another organization. The message deliberately does not
 * distinguish the two so the endpoint cannot be used to enumerate slugs.
 */
export class RestaurantNotClaimableError extends Error {
  constructor() {
    super("This restaurant is not available to claim");
    this.name = "RestaurantNotClaimableError";
  }
}

/**
 * True when a restaurant has never been claimed. Used for the pre-checkout
 * courtesy check; the authoritative guard is the conditional update inside
 * `claimRestaurant`, which pushes the same rule into the database so it
 * cannot lose a check-then-write race.
 */
export function isClaimable(restaurant: {
  status: RestaurantStatus;
  organizationId: string | null;
}): boolean {
  return (
    restaurant.organizationId === null &&
    CLAIMABLE_STATUSES.includes(restaurant.status)
  );
}

/**
 * Matches a restaurant only while it is still unowned. Used as the WHERE
 * clause of the claiming update so the claim becomes a compare-and-swap:
 * Postgres re-evaluates the predicate after a concurrent writer commits, so
 * only one of two racing claims can match the row.
 */
export function unclaimedWhere(slug: string): Prisma.RestaurantWhereInput {
  return { slug, organizationId: null, status: { in: CLAIMABLE_STATUSES } };
}

/**
 * A rejected claim means a real Stripe checkout completed and the buyer got
 * nothing, so it must never be silent: either somebody is probing slugs with
 * tampered metadata, or a paying customer is now holding a subscription to a
 * restaurant they cannot reach. Both need a human, and the transaction is
 * about to roll back, so an audit row would vanish with it.
 */
function rejectClaim(
  checkout: CompletedCheckout,
  reason: string,
): RestaurantNotClaimableError {
  console.error("[restaurant-claim] rejected a completed checkout", {
    reason,
    slug: checkout.restaurantSlug,
    stripeCustomerId: checkout.stripeCustomerId,
    stripeSubscriptionId: checkout.stripeSubscriptionId,
  });
  return new RestaurantNotClaimableError();
}

export type CompletedCheckout = {
  email: string;
  restaurantSlug: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
};

/**
 * Turns a completed Stripe checkout into an owned restaurant.
 *
 * Both the `success_url` callback and the `checkout.session.completed`
 * webhook run this, because either may arrive first and the browser redirect
 * may never arrive at all. It is therefore idempotent: the second caller
 * finds the restaurant already owned by the same organization and returns
 * without touching its status, so a site that has since gone LIVE is not
 * knocked back to CLAIMED.
 *
 * Must be called inside a transaction — a rejected claim relies on the
 * rollback to undo the organization created moments earlier.
 */
export async function claimRestaurant(
  tx: Prisma.TransactionClient,
  checkout: CompletedCheckout,
): Promise<void> {
  const user = await tx.user.upsert({
    where: { email: checkout.email },
    update: {},
    create: { email: checkout.email },
  });

  const membership = await tx.membership.findFirst({
    where: { userId: user.id },
  });

  // Reject before creating an organization rather than after. The rollback
  // would discard an orphaned organization anyway, but only for as long as
  // every caller remembers the transaction; refusing first means a hijack
  // attempt writes nothing regardless. The update below stays authoritative —
  // this read can only reject earlier, never admit something it would not.
  const existing = await tx.restaurant.findUnique({
    where: { slug: checkout.restaurantSlug },
    select: { status: true, organizationId: true },
  });
  const alreadyOurs =
    existing !== null &&
    membership !== null &&
    existing.organizationId === membership.organizationId;
  if (!existing || !(isClaimable(existing) || alreadyOurs)) {
    throw rejectClaim(checkout, "not claimable");
  }

  const organizationId =
    membership?.organizationId ??
    (
      await tx.organization.create({
        data: {
          name: checkout.restaurantSlug,
          memberships: { create: { userId: user.id, role: "owner" } },
        },
      })
    ).id;

  // Matching on slug alone would let any completed checkout reassign somebody
  // else's restaurant, so eligibility lives in the WHERE clause where the
  // database applies it atomically.
  const claimed = await tx.restaurant.updateMany({
    where: unclaimedWhere(checkout.restaurantSlug),
    data: { organizationId, status: "CLAIMED" },
  });

  if (claimed.count === 0) {
    // Not claimable as a fresh prospect. That is only acceptable when it is
    // already ours — the other completion path got here first, or the
    // customer reloaded the success page — and then we leave its status be.
    const ours = await tx.restaurant.count({
      where: { slug: checkout.restaurantSlug, organizationId },
    });
    if (ours === 0) {
      // Reached only by losing a race that the read above had passed.
      throw rejectClaim(checkout, "lost claim race");
    }
  }

  if (checkout.stripeCustomerId) {
    await tx.subscription.upsert({
      where: { stripeCustomerId: checkout.stripeCustomerId },
      update: {
        stripeSubscriptionId: checkout.stripeSubscriptionId,
        stripePriceId: checkout.stripePriceId,
        status: "ACTIVE",
      },
      create: {
        stripeCustomerId: checkout.stripeCustomerId,
        stripeSubscriptionId: checkout.stripeSubscriptionId,
        stripePriceId: checkout.stripePriceId,
        status: "ACTIVE",
        organizationId,
      },
    });
  }
}
