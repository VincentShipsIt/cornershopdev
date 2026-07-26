import { describe, expect, it, mock } from "bun:test";
import type Stripe from "stripe";
import type { PrismaClient } from "@/generated/prisma/client";
import { processStripeWebhookEvent } from "@/lib/stripe-webhook";

describe("Stripe webhook event idempotency", () => {
  it("acknowledges an already committed event without calling Stripe again", async () => {
    const retrieve = mock(async () => {
      throw new Error("must not retrieve duplicate events");
    });
    const stripe = {
      checkout: { sessions: { retrieve } },
    } as unknown as Stripe;
    const transaction = mock(async () => "processed");
    const db = {
      stripeWebhookEvent: {
        findUnique: async () => ({ eventId: "evt_duplicate" }),
      },
      $transaction: transaction,
    } as unknown as Pick<
      PrismaClient,
      "stripeWebhookEvent" | "$transaction"
    >;

    const result = await processStripeWebhookEvent(
      {
        id: "evt_duplicate",
        type: "checkout.session.completed",
        created: 1,
        livemode: false,
        data: { object: { id: "cs_test_1" } },
      } as Stripe.Event,
      stripe,
      db,
    );

    expect(result).toBe("duplicate");
    expect(retrieve).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("ignores event types that are not part of the configured allowlist", async () => {
    const db = {
      stripeWebhookEvent: {
        findUnique: async () => {
          throw new Error("ignored events must not hit storage");
        },
      },
    } as unknown as Pick<
      PrismaClient,
      "stripeWebhookEvent" | "$transaction"
    >;
    const result = await processStripeWebhookEvent(
      {
        id: "evt_ignored",
        type: "customer.created",
      } as Stripe.Event,
      {} as Stripe,
      db,
    );
    expect(result).toBe("ignored");
  });

  it("records and acknowledges a signed Checkout event that is not ours", async () => {
    const created: unknown[] = [];
    const db = {
      stripeWebhookEvent: {
        findUnique: async () => null,
      },
      $transaction: async (
        operation: (transaction: unknown) => Promise<unknown>,
      ) =>
        operation({
          stripeWebhookEvent: {
            create: async (input: unknown) => {
              created.push(input);
            },
          },
        }),
    } as unknown as Pick<
      PrismaClient,
      "stripeWebhookEvent" | "$transaction"
    >;
    const stripe = {
      checkout: {
        sessions: {
          retrieve: async () => ({
            id: "cs_test_unrelated",
            livemode: false,
            subscription: null,
          }),
        },
      },
    } as unknown as Stripe;
    const logged = mock(() => {});
    const original = console.error;
    console.error = logged;
    try {
      const result = await processStripeWebhookEvent(
        {
          id: "evt_unrelated",
          type: "checkout.session.completed",
          created: 1,
          livemode: false,
          data: { object: { id: "cs_test_unrelated" } },
        } as Stripe.Event,
        stripe,
        db,
      );
      expect(result).toBe("rejected");
      expect(created).toHaveLength(1);
    } finally {
      console.error = original;
    }
  });
});
