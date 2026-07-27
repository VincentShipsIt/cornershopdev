import type { Prisma } from "@/generated/prisma/client";
import { SiteStatus } from "@/generated/prisma/enums";
import { normalizeAccountEmail } from "@/lib/account-email";

export const CLAIMABLE_STATUSES: SiteStatus[] = [
  SiteStatus.PROSPECT,
  SiteStatus.PREVIEW_READY,
];

export class SiteNotClaimableError extends Error {
  constructor() {
    super("This site is not available to claim");
    this.name = "SiteNotClaimableError";
  }
}

export function isClaimable(site: {
  status: SiteStatus;
  organizationId: string | null;
}): boolean {
  return (
    site.organizationId === null && CLAIMABLE_STATUSES.includes(site.status)
  );
}

export function unclaimedWhere(slug: string): Prisma.SiteWhereInput {
  return { slug, organizationId: null, status: { in: CLAIMABLE_STATUSES } };
}

function rejectClaim(
  checkout: CompletedCheckout,
  reason: string,
): SiteNotClaimableError {
  console.error("[site-claim] rejected a completed checkout", {
    reason,
    slug: checkout.siteSlug,
    claimInvitationId: checkout.claimInvitationId,
    stripeCheckoutSessionId: checkout.stripeCheckoutSessionId,
    stripeCustomerId: checkout.stripeCustomerId,
    stripeSubscriptionId: checkout.stripeSubscriptionId,
  });
  return new SiteNotClaimableError();
}

export type CompletedCheckout = {
  email: string;
  siteSlug: string;
  claimInvitationId: string;
  stripeCheckoutSessionId: string;
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
 * Accepts one invitation, assigns its site, and records the site-specific
 * subscription in one transaction. The raw invitation token is absent:
 * Checkout creation already verified it and bound one Stripe Session.
 */
export async function claimSite(
  tx: Prisma.TransactionClient,
  checkout: CompletedCheckout,
): Promise<ClaimedSiteAccess> {
  const email = normalizeAccountEmail(checkout.email);
  const now = new Date();
  const invitation = await tx.claimInvitation.findUnique({
    where: { id: checkout.claimInvitationId },
    select: {
      id: true,
      email: true,
      proofMethod: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      checkoutSessionId: true,
      siteId: true,
      site: {
        select: {
          slug: true,
          status: true,
          organizationId: true,
        },
      },
    },
  });

  if (
    !invitation ||
    invitation.site.slug !== checkout.siteSlug ||
    invitation.checkoutSessionId !== checkout.stripeCheckoutSessionId ||
    normalizeAccountEmail(invitation.email) !== email ||
    invitation.revokedAt
  ) {
    throw rejectClaim(checkout, "invitation binding mismatch");
  }
  if (invitation.acceptedAt) {
    return resolveAcceptedClaim(tx, checkout, email);
  }
  if (!isClaimable(invitation.site)) {
    throw rejectClaim(checkout, "site not claimable");
  }

  const accepted = await tx.claimInvitation.updateMany({
    where: {
      id: invitation.id,
      siteId: invitation.siteId,
      email,
      checkoutSessionId: checkout.stripeCheckoutSessionId,
      acceptedAt: null,
      revokedAt: null,
    },
    data: { acceptedAt: now },
  });
  if (accepted.count !== 1) {
    return resolveAcceptedClaim(tx, checkout, email);
  }

  const user = await tx.user.upsert({
    where: { email },
    update: {},
    create: { email, name: accountName(email) },
  });
  const membership = await tx.membership.findFirst({
    where: { userId: user.id },
  });
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

  const claimed = await tx.site.updateMany({
    where: unclaimedWhere(checkout.siteSlug),
    data: { organizationId, status: "CLAIMED" },
  });
  if (claimed.count !== 1) {
    throw rejectClaim(checkout, "lost ownership race");
  }

  await upsertSubscription(tx, checkout, organizationId, invitation.siteId);
  await tx.auditEvent.create({
    data: {
      type: "claim.invitation.accepted",
      actor: `user:${user.id}`,
      metadata: {
        invitationId: invitation.id,
        proofMethod: invitation.proofMethod,
      },
      siteId: invitation.siteId,
    },
  });
  return { userId: user.id, organizationId };
}

async function resolveAcceptedClaim(
  tx: Prisma.TransactionClient,
  checkout: CompletedCheckout,
  email: string,
): Promise<ClaimedSiteAccess> {
  const accepted = await tx.claimInvitation.findUnique({
    where: { id: checkout.claimInvitationId },
    select: {
      acceptedAt: true,
      checkoutSessionId: true,
      siteId: true,
      site: {
        select: {
          slug: true,
          organizationId: true,
        },
      },
    },
  });
  if (
    !accepted?.acceptedAt ||
    accepted.checkoutSessionId !== checkout.stripeCheckoutSessionId ||
    accepted.site.slug !== checkout.siteSlug ||
    !accepted.site.organizationId
  ) {
    throw rejectClaim(checkout, "accepted invitation mismatch");
  }

  const user = await tx.user.upsert({
    where: { email },
    update: {},
    create: { email, name: accountName(email) },
  });
  const membership = await tx.membership.findFirst({
    where: {
      userId: user.id,
      organizationId: accepted.site.organizationId,
    },
  });
  if (!membership) throw rejectClaim(checkout, "accepted owner mismatch");

  await upsertSubscription(
    tx,
    checkout,
    accepted.site.organizationId,
    accepted.siteId,
  );
  return {
    userId: user.id,
    organizationId: accepted.site.organizationId,
  };
}

function accountName(email: string): string {
  return email.split("@")[0]?.trim() || "Account owner";
}

async function upsertSubscription(
  tx: Prisma.TransactionClient,
  checkout: CompletedCheckout,
  organizationId: string,
  siteId: string,
): Promise<void> {
  const existing = await tx.subscription.findUnique({
    where: { siteId },
    select: { lastStripeEventAt: true },
  });
  if (
    existing?.lastStripeEventAt &&
    existing.lastStripeEventAt > checkout.stripeEventCreatedAt
  ) {
    return;
  }

  await tx.subscription.upsert({
    where: { siteId },
    update: {
      stripeCustomerId: checkout.stripeCustomerId,
      stripeSubscriptionId: checkout.stripeSubscriptionId,
      stripePriceId: checkout.stripePriceId,
      status: checkout.subscriptionStatus,
      currentPeriodEnd: checkout.currentPeriodEnd,
      cancelAtPeriodEnd: checkout.cancelAtPeriodEnd,
      lastStripeEventAt: checkout.stripeEventCreatedAt,
      siteId,
    },
    create: {
      stripeCustomerId: checkout.stripeCustomerId,
      stripeSubscriptionId: checkout.stripeSubscriptionId,
      stripePriceId: checkout.stripePriceId,
      status: checkout.subscriptionStatus,
      currentPeriodEnd: checkout.currentPeriodEnd,
      cancelAtPeriodEnd: checkout.cancelAtPeriodEnd,
      lastStripeEventAt: checkout.stripeEventCreatedAt,
      siteId,
      organizationId,
    },
  });
}
