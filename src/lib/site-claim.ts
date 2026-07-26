import type { Prisma } from "@/generated/prisma/client";
import { SiteStatus } from "@/generated/prisma/enums";
import { normalizeAccountEmail } from "@/lib/account-email";

/**
 * A site may only be claimed while it is still an unowned prospect. Once it
 * belongs to an organization, only that organization may act on it — a
 * completed checkout must never be able to reassign somebody else's site just
 * because the caller supplied its slug.
 *
 * Mirrors the equivalent guard on the import path in `site-persistence.ts`,
 * which the claim path was missing.
 */
export const CLAIMABLE_STATUSES: SiteStatus[] = [
  SiteStatus.PROSPECT,
  SiteStatus.PREVIEW_READY,
];

/**
 * Raised when a checkout tries to claim a site that is missing or is already
 * owned by another organization. The message deliberately does not distinguish
 * the two so the endpoint cannot be used to enumerate slugs.
 */
export class SiteNotClaimableError extends Error {
  constructor() {
    super("This site is not available to claim");
    this.name = "SiteNotClaimableError";
  }
}

/**
 * True when a site has never been claimed. Used for the pre-checkout courtesy
 * check; the authoritative guard is the conditional update inside `claimSite`,
 * which pushes the same rule into the database so it cannot lose a
 * check-then-write race.
 */
export function isClaimable(site: {
  status: SiteStatus;
  organizationId: string | null;
}): boolean {
  return (
    site.organizationId === null && CLAIMABLE_STATUSES.includes(site.status)
  );
}

/**
 * Matches a site only while it is still unowned. Used as the WHERE clause of
 * the claiming update so the claim becomes a compare-and-swap: Postgres
 * re-evaluates the predicate after a concurrent writer commits, so only one of
 * two racing claims can match the row.
 */
export function unclaimedWhere(slug: string): Prisma.SiteWhereInput {
  return { slug, organizationId: null, status: { in: CLAIMABLE_STATUSES } };
}

/**
 * A rejected claim means a real Stripe checkout completed and the buyer got
 * nothing, so it must never be silent: either somebody is probing slugs with
 * tampered metadata, or a paying customer is now holding a subscription to a
 * site they cannot reach. Both need a human, and the transaction is about to
 * roll back, so an audit row would vanish with it.
 */
function rejectClaim(
  checkout: CompletedCheckout,
  reason: string,
): SiteNotClaimableError {
  console.error("[site-claim] rejected a completed checkout", {
    reason,
    slug: checkout.siteSlug,
    stripeCustomerId: checkout.stripeCustomerId,
    stripeSubscriptionId: checkout.stripeSubscriptionId,
  });
  return new SiteNotClaimableError();
}

export type CompletedCheckout = {
  email: string;
  siteSlug: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId: string | null;
  subscriptionStatus: "INCOMPLETE" | "ACTIVE" | "PAST_DUE" | "CANCELED";
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeEventCreatedAt: Date;
};

export type ClaimedSiteAccess = {
  userId: string;
  organizationId: string;
};

/**
 * Turns a completed Stripe checkout into an owned site.
 *
 * Both the `success_url` callback and the `checkout.session.completed` webhook
 * run this, because either may arrive first and the browser redirect may never
 * arrive at all. It is therefore idempotent: the second caller finds the site
 * already owned by the same organization and returns without touching its
 * status, so a site that has since gone LIVE is not knocked back to CLAIMED.
 *
 * Must be called inside a transaction — a rejected claim relies on the
 * rollback to undo the organization created moments earlier.
 */
export async function claimSite(
  tx: Prisma.TransactionClient,
  checkout: CompletedCheckout,
): Promise<ClaimedSiteAccess> {
  const email = normalizeAccountEmail(checkout.email);
  const user = await tx.user.upsert({
    where: { email },
    update: {},
    create: { email },
  });

  const membership = await tx.membership.findFirst({
    where: { userId: user.id },
  });

  // Reject before creating an organization rather than after. The rollback
  // would discard an orphaned organization anyway, but only for as long as
  // every caller remembers the transaction; refusing first means a hijack
  // attempt writes nothing regardless. The update below stays authoritative —
  // this read can only reject earlier, never admit something it would not.
  const existing = await tx.site.findUnique({
    where: { slug: checkout.siteSlug },
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
          name: checkout.siteSlug,
          memberships: { create: { userId: user.id, role: "owner" } },
        },
      })
    ).id;

  // Matching on slug alone would let any completed checkout reassign somebody
  // else's site, so eligibility lives in the WHERE clause where the database
  // applies it atomically.
  const claimed = await tx.site.updateMany({
    where: unclaimedWhere(checkout.siteSlug),
    data: { organizationId, status: "CLAIMED" },
  });

  if (claimed.count === 0) {
    // Not claimable as a fresh prospect. That is only acceptable when it is
    // already ours — the other completion path got here first, or the
    // customer reloaded the success page — and then we leave its status be.
    const ours = await tx.site.count({
      where: { slug: checkout.siteSlug, organizationId },
    });
    if (ours === 0) {
      // Reached only by losing a race that the read above had passed.
      throw rejectClaim(checkout, "lost claim race");
    }
  }

  const existingSubscription = await tx.subscription.findUnique({
    where: { stripeCustomerId: checkout.stripeCustomerId },
    select: { lastStripeEventAt: true },
  });
  if (
    !existingSubscription ||
    !existingSubscription.lastStripeEventAt ||
    existingSubscription.lastStripeEventAt <= checkout.stripeEventCreatedAt
  ) {
    await tx.subscription.upsert({
      where: { stripeCustomerId: checkout.stripeCustomerId },
      update: {
        stripeSubscriptionId: checkout.stripeSubscriptionId,
        stripePriceId: checkout.stripePriceId,
        status: checkout.subscriptionStatus,
        currentPeriodEnd: checkout.currentPeriodEnd,
        cancelAtPeriodEnd: checkout.cancelAtPeriodEnd,
        lastStripeEventAt: checkout.stripeEventCreatedAt,
      },
      create: {
        stripeCustomerId: checkout.stripeCustomerId,
        stripeSubscriptionId: checkout.stripeSubscriptionId,
        stripePriceId: checkout.stripePriceId,
        status: checkout.subscriptionStatus,
        currentPeriodEnd: checkout.currentPeriodEnd,
        cancelAtPeriodEnd: checkout.cancelAtPeriodEnd,
        lastStripeEventAt: checkout.stripeEventCreatedAt,
        organizationId,
      },
    });
  }

  return { userId: user.id, organizationId };
}
