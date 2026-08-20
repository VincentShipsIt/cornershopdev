import { describe, expect, it, mock } from "bun:test";
import {
  alertClaimInvitationDeliveryFailure,
  alertCheckoutStartFailure,
  alertPersistedStripeWebhookRejection,
} from "@/lib/billing-operator-alerts";

describe("billing operator alerts", () => {
  it("records a durable checkout-start failure without sensitive context", async () => {
    const capture = mock(async () => "delivered" as const);

    await alertCheckoutStartFailure("chez-lea", capture);

    expect(capture).toHaveBeenCalledWith({
      kind: "CHECKOUT_WEBHOOK_FAILURE",
      dedupKey: "checkout-start:chez-lea",
      title: "Stripe Checkout could not start",
      message: expect.stringContaining("failed before the customer could pay"),
      context: { category: "checkout_start", siteSlug: "chez-lea" },
    });
  });

  it("records a durable alert for a persisted webhook rejection", async () => {
    const capture = mock(async () => "delivered" as const);

    await alertPersistedStripeWebhookRejection(
      {
        id: "evt_test_rejected",
        type: "checkout.session.completed",
      },
      capture,
    );

    expect(capture).toHaveBeenCalledWith({
      kind: "CHECKOUT_WEBHOOK_FAILURE",
      dedupKey: "rejected:checkout.session.completed:evt_test_rejected",
      title: "Stripe webhook was permanently rejected",
      message: expect.stringContaining("persisted as rejected"),
      context: {
        category: "persisted_rejection",
        eventId: "evt_test_rejected",
        eventType: "checkout.session.completed",
      },
    });
  });

  it("records a non-PII alert for claim delivery failure", async () => {
    const capture = mock(async () => "delivered" as const);

    await alertClaimInvitationDeliveryFailure(
      {
        invitationId: "invite_1",
        siteSlug: "chez-lea",
        failureCode: "recipient_bounced",
      },
      capture,
    );

    expect(capture).toHaveBeenCalledWith({
      kind: "OUTREACH_SEND_FAILURE",
      dedupKey: "claim-invitation:invite_1:recipient_bounced",
      title: "Claim invitation delivery failed",
      message: expect.stringContaining("durable delivery ledger"),
      context: {
        category: "claim_invitation",
        invitationId: "invite_1",
        siteSlug: "chez-lea",
        failureCode: "recipient_bounced",
      },
    });
  });
});
