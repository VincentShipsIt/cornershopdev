import type Stripe from "stripe";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { normalizeAccountEmail } from "@/lib/account-email";
import { configuredBillingPlan, FOUNDING_PRICE } from "@/lib/billing-plans";
import {
  claimSite,
  hasValidClaimApprovalEvidence,
  SiteNotClaimableError,
} from "@/lib/site-claim";
import {
  stripeSubscriptionSnapshot,
  type StripeSubscriptionSnapshot,
} from "@/lib/stripe-subscription";
import { reconcileSiteSubscriptionLifecycle } from "@/lib/subscription-site-lifecycle";

const checkoutEventTypes = new Set<Stripe.Event.Type>([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

const subscriptionEventTypes = new Set<Stripe.Event.Type>([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
]);

export type StripeWebhookResult =
  "processed" | "duplicate" | "ignored" | "rejected";

type StripeWebhookDatabase = Pick<
  PrismaClient,
  "$transaction" | "stripeWebhookEvent"
>;

type PreparedStripeEvent =
  | Awaited<ReturnType<typeof retrieveCheckout>>
  | Awaited<ReturnType<typeof retrieveSubscription>>;

export async function processStripeWebhookEvent(
  event: Stripe.Event,
  stripe: Stripe,
  db: StripeWebhookDatabase,
): Promise<StripeWebhookResult> {
  if (
    !checkoutEventTypes.has(event.type) &&
    !subscriptionEventTypes.has(event.type)
  ) {
    return "ignored";
  }

  const duplicate = await db.stripeWebhookEvent.findUnique({
    where: { eventId: event.id },
    select: { eventId: true },
  });
  if (duplicate) return "duplicate";

  let prepared: PreparedStripeEvent;
  try {
    prepared = checkoutEventTypes.has(event.type)
      ? await retrieveCheckout(event, stripe)
      : await retrieveSubscription(event, stripe);
  } catch (error) {
    if (!(error instanceof StripeWebhookValidationError)) throw error;
    return persistRejectedEvent(
      db,
      event,
      error.message,
      eventInvitationId(event),
    );
  }

  try {
    return await db.$transaction(async (tx) => {
      await tx.stripeWebhookEvent.create({
        data: {
          eventId: event.id,
          type: event.type,
          livemode: event.livemode,
          stripeCreatedAt: stripeTimestamp(event.created),
        },
      });

      if (prepared.kind === "checkout") {
        await provisionCheckout(tx, event, prepared.session, prepared.snapshot);
      } else {
        await synchronizeSubscription(tx, event, prepared.snapshot);
      }
      return "processed" as const;
    });
  } catch (error) {
    if (
      error instanceof StripeWebhookValidationError ||
      error instanceof SiteNotClaimableError
    ) {
      // The processing transaction has rolled back, including any owner/org
      // writes. Persist the permanent rejection separately so it is queryable
      // without asking Stripe to retry an event that cannot become valid.
      return persistRejectedEvent(
        db,
        event,
        error.message,
        prepared.kind === "checkout"
          ? prepared.session.metadata?.claimInvitationId
          : undefined,
      );
    }
    if (hasPrismaCode(error, "P2002")) {
      const committed = await db.stripeWebhookEvent.findUnique({
        where: { eventId: event.id },
        select: { eventId: true },
      });
      if (committed) return "duplicate";
    }
    throw error;
  }
}

async function persistRejectedEvent(
  db: StripeWebhookDatabase,
  event: Stripe.Event,
  reason: string,
  invitationId: string | undefined,
): Promise<StripeWebhookResult> {
  try {
    await db.$transaction(async (tx) => {
      await tx.stripeWebhookEvent.create({
        data: {
          eventId: event.id,
          type: event.type,
          livemode: event.livemode,
          stripeCreatedAt: stripeTimestamp(event.created),
          status: "REJECTED",
          failureReason: reason,
        },
      });
      if (!invitationId) return;
      const invitation = await tx.claimInvitation.findUnique({
        where: { id: invitationId },
        select: { siteId: true },
      });
      if (!invitation) return;
      await tx.auditEvent.create({
        data: {
          type: "stripe.webhook.rejected",
          actor: "system:stripe",
          siteId: invitation.siteId,
          metadata: {
            stripeEventId: event.id,
            stripeEventType: event.type,
            reason,
            invitationId,
          },
        },
      });
    });
  } catch (error) {
    if (hasPrismaCode(error, "P2002")) return "duplicate";
    throw error;
  }
  console.error("[stripe-webhook] rejected event", {
    eventId: event.id,
    eventType: event.type,
    reason,
  });
  return "rejected";
}

async function retrieveCheckout(event: Stripe.Event, stripe: Stripe) {
  const eventSession = event.data.object as Stripe.Checkout.Session;
  const session = await stripe.checkout.sessions.retrieve(eventSession.id, {
    expand: ["subscription"],
  });
  if (session.livemode !== event.livemode) {
    throw new StripeWebhookValidationError("Checkout mode mismatch");
  }
  if (!session.subscription || typeof session.subscription === "string") {
    throw new StripeWebhookValidationError(
      "Checkout subscription was not expanded",
    );
  }
  return {
    kind: "checkout" as const,
    session,
    snapshot: stripeSubscriptionSnapshot(session.subscription),
  };
}

async function retrieveSubscription(event: Stripe.Event, stripe: Stripe) {
  const eventSubscription = event.data.object as Stripe.Subscription;
  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(eventSubscription.id);
  } catch (error) {
    if (event.type !== "customer.subscription.deleted") throw error;
    subscription = eventSubscription;
  }
  return {
    kind: "subscription" as const,
    snapshot: stripeSubscriptionSnapshot(subscription),
  };
}

async function provisionCheckout(
  tx: Prisma.TransactionClient,
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
  snapshot: StripeSubscriptionSnapshot,
) {
  if (
    session.mode !== "subscription" ||
    session.status !== "complete" ||
    session.payment_status !== "paid"
  ) {
    throw new StripeWebhookValidationError("Checkout is not paid and complete");
  }
  const invitationId = session.metadata?.claimInvitationId;
  if (!invitationId || session.client_reference_id !== invitationId) {
    throw new StripeWebhookValidationError(
      "Checkout claim metadata is invalid",
    );
  }

  const invitation = await tx.claimInvitation.findUnique({
    where: { id: invitationId },
    select: {
      id: true,
      email: true,
      proofMethod: true,
      approvalEvidenceRef: true,
      approvedBy: true,
      approvedAt: true,
      acceptedAt: true,
      checkoutSessionId: true,
      stripePriceId: true,
      site: { select: { id: true, slug: true } },
    },
  });
  if (
    !invitation ||
    invitation.checkoutSessionId !== session.id ||
    invitation.stripePriceId !== snapshot.stripePriceId ||
    session.metadata?.siteSlug !== invitation.site.slug
  ) {
    throw new StripeWebhookValidationError(
      "Checkout is not bound to this claim invitation",
    );
  }
  if (!hasValidClaimApprovalEvidence(invitation)) {
    throw new StripeWebhookValidationError(
      "Claim invitation ownership evidence is invalid",
    );
  }

  const priceId = snapshot.stripePriceId;
  const metadataPlan = session.metadata?.plan;
  const plan = configuredBillingPlan();
  if (!priceId || priceId !== plan.priceId || metadataPlan !== plan.id) {
    throw new StripeWebhookValidationError("Checkout price is not configured");
  }
  if (
    session.currency?.toLowerCase() !== FOUNDING_PRICE.currency ||
    session.amount_subtotal !== FOUNDING_PRICE.unitAmount ||
    (session.total_details?.amount_discount ?? 0) !== 0
  ) {
    throw new StripeWebhookValidationError(
      "Checkout total does not match the founding offer",
    );
  }

  const email = session.customer_details?.email ?? session.customer_email;
  if (
    !email ||
    normalizeAccountEmail(email) !== normalizeAccountEmail(invitation.email)
  ) {
    throw new StripeWebhookValidationError(
      "Checkout email does not match the claim invitation",
    );
  }

  const access = await claimSite(tx, {
    email,
    siteSlug: invitation.site.slug,
    claimInvitationId: invitation.id,
    stripeCheckoutSessionId: session.id,
    ...snapshot,
    subscriptionStatus: snapshot.status,
    stripeEventCreatedAt: stripeTimestamp(event.created),
    stripeEventId: event.id,
  });
  if (!invitation.acceptedAt) {
    await tx.auditEvent.create({
      data: {
        type: "stripe.checkout.provisioned",
        actor: email,
        siteId: invitation.site.id,
        metadata: {
          stripeEventId: event.id,
          stripeEventType: event.type,
          livemode: event.livemode,
          claimInvitationId: invitation.id,
          checkoutSessionId: session.id,
          stripeSubscriptionId: snapshot.stripeSubscriptionId,
          stripePriceId: snapshot.stripePriceId,
          paymentStatus: session.payment_status,
          organizationId: access.organizationId,
          plan: metadataPlan,
        },
      },
    });
  }
}

async function synchronizeSubscription(
  tx: Prisma.TransactionClient,
  event: Stripe.Event,
  snapshot: StripeSubscriptionSnapshot,
) {
  const eventCreatedAt = stripeTimestamp(event.created);
  const updated = await tx.subscription.updateMany({
    where: {
      stripeSubscriptionId: snapshot.stripeSubscriptionId,
      OR: [
        { lastStripeEventAt: null },
        { lastStripeEventAt: { lte: eventCreatedAt } },
      ],
    },
    data: {
      stripeSubscriptionId: snapshot.stripeSubscriptionId,
      stripePriceId: snapshot.stripePriceId,
      status: snapshot.status,
      currentPeriodEnd: snapshot.currentPeriodEnd,
      cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
      lastStripeEventAt: eventCreatedAt,
    },
  });
  if (updated.count === 0) return;

  const subscription = await tx.subscription.findFirst({
    where: { stripeSubscriptionId: snapshot.stripeSubscriptionId },
    select: { siteId: true },
  });
  if (!subscription) return;
  await reconcileSiteSubscriptionLifecycle(tx, {
    siteId: subscription.siteId,
    subscriptionStatus: snapshot.status,
    stripeEventId: event.id,
  });
}

function eventInvitationId(event: Stripe.Event): string | undefined {
  const object = event.data.object as { metadata?: Stripe.Metadata | null };
  return object.metadata?.claimInvitationId;
}

function stripeTimestamp(value: number): Date {
  return new Date(value * 1000);
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

class StripeWebhookValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeWebhookValidationError";
  }
}
