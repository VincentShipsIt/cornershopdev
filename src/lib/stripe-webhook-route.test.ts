import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import type Stripe from "stripe";

type AfterCallback = () => void | Promise<void>;

const scheduledCallbacks: AfterCallback[] = [];
const captureOperatorAlert = mock(async () => "delivered" as const);
const constructEvent = mock(
  () =>
    ({
      id: "evt_failed",
      type: "checkout.session.completed",
    }) as Stripe.Event,
);

mock.module("next/server", () => ({
  after: (callback: AfterCallback) => {
    scheduledCallbacks.push(callback);
  },
}));
mock.module("@/lib/operator-alerts", () => ({ captureOperatorAlert }));
mock.module("@/lib/stripe", () => ({
  getStripe: () => ({ webhooks: { constructEvent } }),
}));
mock.module("@/lib/db", () => ({ getDb: () => ({}) }));

const previousDatabaseUrl = process.env.DATABASE_URL;
const previousWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const { POST, schedulePersistedStripeWebhookRejection } = await import(
  "@/app/api/webhooks/stripe/route"
);

describe("Stripe webhook operator alert lifecycle", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgresql://unused-by-mocked-test.invalid/db";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_configured";
    scheduledCallbacks.length = 0;
    captureOperatorAlert.mockClear();
    constructEvent.mockClear();
  });

  afterAll(() => {
    restoreEnvironment("DATABASE_URL", previousDatabaseUrl);
    restoreEnvironment("STRIPE_WEBHOOK_SECRET", previousWebhookSecret);
  });

  it("extends the response lifecycle for missing configuration alerts", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(captureOperatorAlert).not.toHaveBeenCalled();
    expect(scheduledCallbacks).toHaveLength(1);
    await scheduledCallbacks[0]!();
    expect(captureOperatorAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "CHECKOUT_WEBHOOK_FAILURE",
        dedupKey: "webhook-configuration",
      }),
    );
  });

  it("extends the response lifecycle for missing persistence alerts", async () => {
    delete process.env.DATABASE_URL;

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(captureOperatorAlert).not.toHaveBeenCalled();
    expect(scheduledCallbacks).toHaveLength(1);
    await scheduledCallbacks[0]!();
    expect(captureOperatorAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "CHECKOUT_WEBHOOK_FAILURE",
        dedupKey: "webhook-persistence",
      }),
    );
  });

  it("extends the response lifecycle for processing failure alerts", async () => {
    const originalConsoleError = console.error;
    console.error = mock(() => {});
    let response: Response;
    try {
      response = await POST(request());
    } finally {
      console.error = originalConsoleError;
    }

    expect(response.status).toBe(500);
    expect(captureOperatorAlert).not.toHaveBeenCalled();
    expect(scheduledCallbacks).toHaveLength(1);
    await scheduledCallbacks[0]!();
    expect(captureOperatorAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "CHECKOUT_WEBHOOK_FAILURE",
        dedupKey: "checkout.session.completed:evt_failed",
      }),
    );
  });

  it("extends the response lifecycle for persisted rejection alerts", async () => {
    const rejectionAlert = mock(async () => "delivered" as const);

    schedulePersistedStripeWebhookRejection(
      {
        id: "evt_failed",
        type: "checkout.session.completed",
      },
      (callback) => scheduledCallbacks.push(callback),
      rejectionAlert,
    );

    expect(rejectionAlert).not.toHaveBeenCalled();
    expect(scheduledCallbacks).toHaveLength(1);
    await scheduledCallbacks[0]!();
    expect(rejectionAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "evt_failed",
        type: "checkout.session.completed",
      }),
    );
  });
});

function request(): Request {
  return new Request("https://cornershop.dev/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": "signed" },
    body: "{}",
  });
}

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
