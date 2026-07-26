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

  it("provisions once without a browser return and converges lifecycle events", async () => {
    const previousStarter = process.env.STRIPE_STARTER_PRICE_ID;
    const previousGrowth = process.env.STRIPE_GROWTH_PRICE_ID;
    process.env.STRIPE_STARTER_PRICE_ID = "price_starter";
    process.env.STRIPE_GROWTH_PRICE_ID = "price_growth";

    const { db, state } = createWebhookDatabase();
    let currentSubscription = subscriptionFixture();
    const stripe = {
      checkout: {
        sessions: {
          retrieve: async () =>
            checkoutFixture(currentSubscription),
        },
      },
      subscriptions: {
        retrieve: async () => currentSubscription,
      },
    } as unknown as Stripe;

    try {
      expect(
        await processStripeWebhookEvent(
          checkoutEvent("evt_checkout_1", 100),
          stripe,
          db,
        ),
      ).toBe("processed");
      expect(state.users).toHaveLength(1);
      expect(state.organizations).toHaveLength(1);
      expect(state.memberships).toHaveLength(1);
      expect(state.subscriptions).toHaveLength(1);
      expect(state.sites[0]).toMatchObject({
        status: "CLAIMED",
        organizationId: state.organizations[0].id,
      });
      expect(state.invitation.acceptedAt).toBeInstanceOf(Date);
      expect(state.audits).toHaveLength(2);

      // A transport retry and a second valid completion event are both safe.
      expect(
        await processStripeWebhookEvent(
          checkoutEvent("evt_checkout_1", 100),
          stripe,
          db,
        ),
      ).toBe("duplicate");
      expect(
        await processStripeWebhookEvent(
          checkoutEvent("evt_checkout_2", 101),
          stripe,
          db,
        ),
      ).toBe("processed");
      expect(state.users).toHaveLength(1);
      expect(state.organizations).toHaveLength(1);
      expect(state.memberships).toHaveLength(1);
      expect(state.subscriptions).toHaveLength(1);
      expect(state.audits).toHaveLength(2);

      currentSubscription = subscriptionFixture({ status: "past_due" });
      expect(
        await processStripeWebhookEvent(
          subscriptionEvent("evt_past_due", 200, currentSubscription),
          stripe,
          db,
        ),
      ).toBe("processed");
      expect(state.subscriptions[0].status).toBe("PAST_DUE");

      // A late older event reads Stripe's current resource but still cannot
      // overwrite a state already recorded at a newer event timestamp.
      currentSubscription = subscriptionFixture({ status: "active" });
      await processStripeWebhookEvent(
        subscriptionEvent("evt_late_active", 150, currentSubscription),
        stripe,
        db,
      );
      expect(state.subscriptions[0].status).toBe("PAST_DUE");

      currentSubscription = subscriptionFixture({ status: "canceled" });
      await processStripeWebhookEvent(
        subscriptionEvent("evt_canceled", 300, currentSubscription),
        stripe,
        db,
      );
      expect(state.subscriptions[0].status).toBe("CANCELED");

      currentSubscription = subscriptionFixture({ status: "active" });
      await processStripeWebhookEvent(
        subscriptionEvent("evt_resumed", 400, currentSubscription),
        stripe,
        db,
      );
      expect(state.subscriptions[0].status).toBe("ACTIVE");
      expect(state.events).toHaveLength(6);
    } finally {
      restoreEnvironment("STRIPE_STARTER_PRICE_ID", previousStarter);
      restoreEnvironment("STRIPE_GROWTH_PRICE_ID", previousGrowth);
    }
  });

  it("rolls back partial claim writes and persists a durable rejection", async () => {
    const previousStarter = process.env.STRIPE_STARTER_PRICE_ID;
    const previousGrowth = process.env.STRIPE_GROWTH_PRICE_ID;
    process.env.STRIPE_STARTER_PRICE_ID = "price_starter";
    process.env.STRIPE_GROWTH_PRICE_ID = "price_growth";
    const { db, state } = createWebhookDatabase({ loseClaimRace: true });
    const stripe = {
      checkout: {
        sessions: {
          retrieve: async () => checkoutFixture(subscriptionFixture()),
        },
      },
    } as unknown as Stripe;
    const original = console.error;
    console.error = mock(() => {});
    try {
      expect(
        await processStripeWebhookEvent(
          checkoutEvent("evt_rejected", 500),
          stripe,
          db,
        ),
      ).toBe("rejected");
      expect(state.users).toHaveLength(0);
      expect(state.organizations).toHaveLength(0);
      expect(state.memberships).toHaveLength(0);
      expect(state.subscriptions).toHaveLength(0);
      expect(state.invitation.acceptedAt).toBeNull();
      expect(state.events).toEqual([
        expect.objectContaining({
          eventId: "evt_rejected",
          status: "REJECTED",
          failureReason: "This site is not available to claim",
        }),
      ]);
      expect(state.audits).toHaveLength(1);
    } finally {
      console.error = original;
      restoreEnvironment("STRIPE_STARTER_PRICE_ID", previousStarter);
      restoreEnvironment("STRIPE_GROWTH_PRICE_ID", previousGrowth);
    }
  });

  it("provisions an in-flight Checkout on an explicitly grandfathered price", async () => {
    const previousStarter = process.env.STRIPE_STARTER_PRICE_ID;
    const previousGrowth = process.env.STRIPE_GROWTH_PRICE_ID;
    const previousLegacy = process.env.STRIPE_LEGACY_PRICE_IDS;
    process.env.STRIPE_STARTER_PRICE_ID = "price_starter";
    process.env.STRIPE_GROWTH_PRICE_ID = "price_growth_current";
    process.env.STRIPE_LEGACY_PRICE_IDS = "price_growth_retired";
    const { db, state } = createWebhookDatabase();
    state.invitation.stripePriceId = "price_growth_retired";
    const subscription = subscriptionFixture();
    subscription.items.data[0].price.id = "price_growth_retired";
    const stripe = {
      checkout: {
        sessions: {
          retrieve: async () => checkoutFixture(subscription),
        },
      },
    } as unknown as Stripe;

    try {
      expect(
        await processStripeWebhookEvent(
          checkoutEvent("evt_legacy_price", 600),
          stripe,
          db,
        ),
      ).toBe("processed");
      expect(state.subscriptions[0]).toMatchObject({
        stripePriceId: "price_growth_retired",
        status: "ACTIVE",
        siteId: "site_1",
      });
    } finally {
      restoreEnvironment("STRIPE_STARTER_PRICE_ID", previousStarter);
      restoreEnvironment("STRIPE_GROWTH_PRICE_ID", previousGrowth);
      restoreEnvironment("STRIPE_LEGACY_PRICE_IDS", previousLegacy);
    }
  });
});

type SiteRow = {
  id: string;
  slug: string;
  status: string;
  organizationId: string | null;
};

type SubscriptionRow = {
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  lastStripeEventAt: Date | null;
  siteId: string;
  organizationId: string;
};

function createWebhookDatabase(
  options: { loseClaimRace?: boolean } = {},
) {
  const state = {
    events: [] as Array<{
      eventId: string;
      status?: string;
      failureReason?: string;
    }>,
    invitation: {
      id: "invite_1",
      email: "owner@chez-lea.test",
      proofMethod: "DOMAIN_EMAIL",
      expiresAt: new Date("2099-01-01"),
      acceptedAt: null as Date | null,
      revokedAt: null as Date | null,
      checkoutSessionId: "cs_test_1",
      stripePriceId: "price_growth",
      siteId: "site_1",
    },
    sites: [
      {
        id: "site_1",
        slug: "chez-lea",
        status: "PREVIEW_READY",
        organizationId: null,
      },
    ] as SiteRow[],
    users: [] as Array<{ id: string; email: string }>,
    organizations: [] as Array<{ id: string; name: string }>,
    memberships: [] as Array<{ userId: string; organizationId: string }>,
    subscriptions: [] as SubscriptionRow[],
    audits: [] as unknown[],
  };
  let sequence = 0;
  const nextId = (prefix: string) => `${prefix}_${(sequence += 1)}`;

  const tx = {
    stripeWebhookEvent: {
      create: async ({
        data,
      }: {
        data: {
          eventId: string;
          status?: string;
          failureReason?: string;
        };
      }) => {
        if (state.events.some((row) => row.eventId === data.eventId)) {
          throw Object.assign(new Error("duplicate"), { code: "P2002" });
        }
        state.events.push(data);
      },
    },
    claimInvitation: {
      findUnique: async () => ({
        ...state.invitation,
        site: { ...state.sites[0] },
      }),
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; acceptedAt: null };
        data: { acceptedAt: Date };
      }) => {
        if (
          state.invitation.id !== where.id ||
          state.invitation.acceptedAt !== null
        ) {
          return { count: 0 };
        }
        state.invitation.acceptedAt = data.acceptedAt;
        return { count: 1 };
      },
    },
    user: {
      upsert: async ({
        where,
        create,
      }: {
        where: { email: string };
        create: { email: string };
      }) => {
        const existing = state.users.find((row) => row.email === where.email);
        if (existing) return existing;
        const user = { id: nextId("user"), email: create.email };
        state.users.push(user);
        return user;
      },
    },
    membership: {
      findFirst: async ({ where }: { where: { userId: string } }) =>
        state.memberships.find((row) => row.userId === where.userId) ?? null,
    },
    organization: {
      create: async ({
        data,
      }: {
        data: {
          name: string;
          memberships: { create: { userId: string } };
        };
      }) => {
        const organization = { id: nextId("org"), name: data.name };
        state.organizations.push(organization);
        state.memberships.push({
          userId: data.memberships.create.userId,
          organizationId: organization.id,
        });
        return organization;
      },
    },
    site: {
      findUnique: async ({ where }: { where: { slug: string } }) =>
        state.sites.find((row) => row.slug === where.slug) ?? null,
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          slug: string;
          organizationId: null;
          status: { in: string[] };
        };
        data: Partial<SiteRow>;
      }) => {
        if (options.loseClaimRace && data.status === "CLAIMED") {
          return { count: 0 };
        }
        const matches = state.sites.filter(
          (row) =>
            row.slug === where.slug &&
            row.organizationId === null &&
            where.status.in.includes(row.status),
        );
        for (const row of matches) Object.assign(row, data);
        return { count: matches.length };
      },
      count: async ({
        where,
      }: {
        where: { slug: string; organizationId: string };
      }) =>
        state.sites.filter(
          (row) =>
            row.slug === where.slug &&
            row.organizationId === where.organizationId,
        ).length,
    },
    subscription: {
      findUnique: async ({
        where,
      }: {
        where: { siteId: string };
      }) =>
        state.subscriptions.find(
          (row) => row.siteId === where.siteId,
        ) ?? null,
      upsert: async ({
        where,
        update,
        create,
      }: {
        where: { siteId: string };
        update: Partial<SubscriptionRow>;
        create: SubscriptionRow;
      }) => {
        const existing = state.subscriptions.find(
          (row) => row.siteId === where.siteId,
        );
        if (existing) return Object.assign(existing, update);
        state.subscriptions.push(create);
        return create;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          stripeSubscriptionId: string;
          OR: Array<
            | { lastStripeEventAt: null }
            | { lastStripeEventAt: { lte: Date } }
          >;
        };
        data: Partial<SubscriptionRow>;
      }) => {
        const existing = state.subscriptions.find(
          (row) =>
            row.stripeSubscriptionId === where.stripeSubscriptionId,
        );
        if (!existing) return { count: 0 };
        const eligible = where.OR.some((condition) => {
          if (condition.lastStripeEventAt === null) {
            return existing.lastStripeEventAt === null;
          }
          return (
            existing.lastStripeEventAt !== null &&
            existing.lastStripeEventAt <= condition.lastStripeEventAt.lte
          );
        });
        if (!eligible) return { count: 0 };
        Object.assign(existing, data);
        return { count: 1 };
      },
    },
    auditEvent: {
      create: async (input: unknown) => {
        state.audits.push(input);
      },
    },
  };
  const db = {
    stripeWebhookEvent: {
      findUnique: async ({ where }: { where: { eventId: string } }) =>
        state.events.some((row) => row.eventId === where.eventId)
          ? { eventId: where.eventId }
          : null,
    },
    $transaction: async (
      operation: (transaction: unknown) => Promise<unknown>,
    ) => {
      const snapshot = structuredClone(state);
      try {
        return await operation(tx);
      } catch (error) {
        Object.assign(state, snapshot);
        throw error;
      }
    },
  } as unknown as Pick<
    PrismaClient,
    "stripeWebhookEvent" | "$transaction"
  >;
  return { db, state };
}

function checkoutFixture(
  subscription: Stripe.Subscription,
): Stripe.Checkout.Session {
  return {
    id: "cs_test_1",
    livemode: false,
    mode: "subscription",
    status: "complete",
    payment_status: "paid",
    client_reference_id: "invite_1",
    customer: "cus_1",
    customer_email: "owner@chez-lea.test",
    customer_details: { email: "owner@chez-lea.test" },
    metadata: {
      claimInvitationId: "invite_1",
      siteSlug: "chez-lea",
      plan: "growth",
    },
    subscription,
  } as unknown as Stripe.Checkout.Session;
}

function subscriptionFixture(
  overrides: Partial<Stripe.Subscription> = {},
): Stripe.Subscription {
  return {
    id: "sub_1",
    customer: "cus_1",
    status: "active",
    cancel_at_period_end: false,
    items: {
      data: [
        {
          id: "si_1",
          current_period_end: 1_785_110_400,
          price: { id: "price_growth" },
        },
      ],
    },
    ...overrides,
  } as Stripe.Subscription;
}

function checkoutEvent(id: string, created: number): Stripe.Event {
  return {
    id,
    type: "checkout.session.completed",
    created,
    livemode: false,
    data: { object: { id: "cs_test_1" } },
  } as Stripe.Event;
}

function subscriptionEvent(
  id: string,
  created: number,
  subscription: Stripe.Subscription,
): Stripe.Event {
  return {
    id,
    type: "customer.subscription.updated",
    created,
    livemode: false,
    data: { object: subscription },
  } as Stripe.Event;
}

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
