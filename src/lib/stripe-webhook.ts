import type Stripe from "stripe";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { normalizeAccountEmail } from "@/lib/account-email";
import {
  billingPlanForPrice,
  configuredBillingPlans,
} from "@/lib/billing-plans";
import { claimSite, SiteNotClaimableError } from "@/lib/site-claim";
import {
  stripeSubscriptionSnapshot,
  type StripeSubscriptionSnapshot,
} from "@/lib/stripe-subscription";

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
  | "processed"
  | "duplicate"
  | "ignored"
  | "rejected";

type StripeWebhookDatabase = Pick<
  PrismaClient,
  "$transaction" | "stripeWebhookEvent"
>;

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

  let prepared:
    | Awaited<ReturnType<typeof retrieveCheckout>>
    | Awaited<ReturnType<typeof retrieveSubscription>>
    | { kind: "rejected"; reason: string };
  try {
    prepared = checkoutEventTypes.has(event.type)
      ? await retrieveCheckout(event, stripe)
      : await retrieveSubscription(event, stripe);
  } catch (error) {
    if (!(error instanceof StripeWebhookValidationError)) throw error;
    prepared = { kind: "rejected", reason: error.message };
  }

  try {
    return await db.$transaction(async (tx) => {
      await tx.stripeWebhookEvent.create({
        data: {
          eventId: event.id,
          type: event.type,
          stripeCreatedAt: stripeTimestamp(event.created),
        },
      });

      if (prepared.kind === "rejected") {
        console.error("[stripe-webhook] rejected event", {
          eventId: event.id,
          reason: prepared.reason,
        });
        return "rejected";
      }

      if (prepared.kind === "checkout") {
        try {
          await provisionCheckout(tx, event, prepared.session, prepared.snapshot);
          return "processed";
        } catch (error) {
          if (
            error instanceof StripeWebhookValidationError ||
            error instanceof SiteNotClaimableError
          ) {
            console.error("[stripe-webhook] rejected checkout", {
              eventId: event.id,
              reason: error.message,
            });
            return "rejected";
          }
          throw error;
        }
      }

      await synchronizeSubscription(tx, event, prepared.snapshot);
      return "processed";
    });
  } catch (error) {
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

async function retrieveCheckout(event: Stripe.Event, stripe: Stripe) {
  const eventSession = event.data.object as Stripe.Checkout.Session;
  const session = await stripe.checkout.sessions.retrieve(eventSession.id, {
    expand: ["subscription"],
  });
  if (session.livemode !== event.livemode) {
    throw new StripeWebhookValidationError("Checkout mode mismatch");
  }
  if (
    !session.subscription ||
    typeof session.subscription === "string"
  ) {
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
    // Stripe doesn't guarantee event delivery order. Reading the current
    // resource makes a late update converge on Stripe's latest state.
    subscription = await stripe.subscriptions.retrieve(eventSubscription.id);
  } catch (error) {
    // A deleted subscription is terminal and can become unavailable to a later
    // retrieve. Its signed event payload remains authoritative.
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
    session.payment_status === "unpaid"
  ) {
    throw new StripeWebhookValidationError("Checkout is not paid and complete");
  }
  const invitationId = session.metadata?.claimInvitationId;
  if (!invitationId || session.client_reference_id !== invitationId) {
    throw new StripeWebhookValidationError("Checkout claim metadata is invalid");
  }

  const invitation = await tx.claimInvitation.findUnique({
    where: { id: invitationId },
    select: {
      id: true,
      email: true,
      acceptedAt: true,
      stripeCheckoutSessionId: true,
      stripePriceId: true,
      site: {
        select: {
          id: true,
          slug: true,
        },
      },
    },
  });
  if (
    !invitation ||
    invitation.stripeCheckoutSessionId !== session.id ||
    invitation.stripePriceId !== snapshot.stripePriceId ||
    session.metadata?.siteSlug !== invitation.site.slug
  ) {
    throw new StripeWebhookValidationError(
      "Checkout is not bound to this claim invitation",
    );
  }

  const plans = configuredBillingPlans();
  const plan = snapshot.stripePriceId
    ? billingPlanForPrice(snapshot.stripePriceId, plans)
    : null;
  if (!plan || session.metadata?.plan !== plan.id) {
    throw new StripeWebhookValidationError("Checkout price is not configured");
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
    ...snapshot,
    subscriptionStatus: snapshot.status,
    stripeEventCreatedAt: stripeTimestamp(event.created),
  });
  const accepted = await tx.claimInvitation.updateMany({
    where: {
      id: invitation.id,
      acceptedAt: null,
    },
    data: { acceptedAt: new Date() },
  });
  if (accepted.count === 1) {
    await tx.auditEvent.create({
      data: {
        type: "stripe.checkout.provisioned",
        actor: email,
        siteId: invitation.site.id,
        metadata: {
          stripeEventId: event.id,
          stripeSubscriptionId: snapshot.stripeSubscriptionId,
          organizationId: access.organizationId,
          plan: plan.id,
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
  await tx.subscription.updateMany({
    where: {
      stripeCustomerId: snapshot.stripeCustomerId,
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
