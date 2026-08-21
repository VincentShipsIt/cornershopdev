import type Stripe from "stripe";
import {
  captureOperatorAlert,
  type AlertDeliveryOutcome,
  type CaptureOperatorAlertInput,
} from "@/lib/operator-alerts";

type OperatorAlertCapture = (
  input: CaptureOperatorAlertInput,
) => Promise<AlertDeliveryOutcome>;

export function alertCheckoutStartFailure(
  siteSlug: string,
  capture: OperatorAlertCapture = captureOperatorAlert,
): Promise<AlertDeliveryOutcome> {
  return capture({
    kind: "CHECKOUT_WEBHOOK_FAILURE",
    dedupKey: `checkout-start:${siteSlug}`,
    title: "Stripe Checkout could not start",
    message:
      "An invitation-authorized Checkout failed before the customer could pay. Inspect billing configuration, Stripe availability, and the site claim audit trail.",
    context: { category: "checkout_start", siteSlug },
  });
}

export function alertPersistedStripeWebhookRejection(
  event: Pick<Stripe.Event, "id" | "type">,
  capture: OperatorAlertCapture = captureOperatorAlert,
): Promise<AlertDeliveryOutcome> {
  return capture({
    kind: "CHECKOUT_WEBHOOK_FAILURE",
    dedupKey: `rejected:${event.type}:${event.id}`,
    title: "Stripe webhook was permanently rejected",
    message:
      "A signed Stripe event failed permanent claim or billing validation and was persisted as rejected. Inspect the event ledger and site claim audit before refunding or replaying anything.",
    context: {
      category: "persisted_rejection",
      eventId: event.id,
      eventType: event.type,
    },
  });
}

export function alertClaimInvitationDeliveryFailure(
  input: {
    invitationId: string;
    siteSlug?: string;
    failureCode: string;
  },
  capture: OperatorAlertCapture = captureOperatorAlert,
): Promise<AlertDeliveryOutcome> {
  return capture({
    kind: "OUTREACH_SEND_FAILURE",
    dedupKey: `claim-invitation:${input.invitationId}:${input.failureCode}`,
    title: "Claim invitation delivery failed",
    message:
      "A claim invitation was not delivered. Inspect its durable delivery ledger, verify the approved address, and use the bounded operator retry when safe.",
    context: {
      category: "claim_invitation",
      invitationId: input.invitationId,
      failureCode: input.failureCode,
      ...(input.siteSlug ? { siteSlug: input.siteSlug } : {}),
    },
  });
}
