import { describe, expect, it } from "bun:test";
import type { Prisma } from "@/generated/prisma/client";
import {
  CLAIMABLE_STATUSES,
  claimRestaurant,
  isClaimable,
  RestaurantNotClaimableError,
  unclaimedWhere,
} from "@/lib/restaurant-claim";

describe("restaurant claim eligibility", () => {
  it("accepts an unowned prospect", () => {
    expect(isClaimable({ status: "PROSPECT", organizationId: null })).toBe(true);
    expect(isClaimable({ status: "PREVIEW_READY", organizationId: null })).toBe(
      true,
    );
  });

  it("rejects a restaurant that already belongs to an organization", () => {
    expect(isClaimable({ status: "PROSPECT", organizationId: "org_a" })).toBe(
      false,
    );
  });

  it("rejects a restaurant that has moved past the prospect stage", () => {
    for (const status of ["CLAIMED", "LIVE", "PAUSED"] as const) {
      expect(isClaimable({ status, organizationId: null })).toBe(false);
    }
  });

  it("never treats a live or claimed restaurant as claimable", () => {
    expect(CLAIMABLE_STATUSES).not.toContain("CLAIMED");
    expect(CLAIMABLE_STATUSES).not.toContain("LIVE");
    expect(CLAIMABLE_STATUSES).not.toContain("PAUSED");
  });
});

describe("unclaimedWhere", () => {
  it("pins the update to the requested slug and to unowned prospects", () => {
    expect(unclaimedWhere("chez-lea")).toEqual({
      slug: "chez-lea",
      organizationId: null,
      status: { in: CLAIMABLE_STATUSES },
    });
  });
});

describe("claimRestaurant", () => {
  it("hands an unowned prospect to the buyer and records the subscription", async () => {
    const { state, tx } = createFakeTx([
      { slug: "chez-lea", status: "PREVIEW_READY", organizationId: null },
    ]);

    await claimRestaurant(tx, completedCheckout());

    const restaurant = state.restaurants[0];
    expect(restaurant.status).toBe("CLAIMED");
    expect(restaurant.organizationId).toBe(state.organizations[0].id);
    expect(state.subscriptions).toEqual([
      {
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "sub_1",
        stripePriceId: "price_1",
        status: "ACTIVE",
        organizationId: state.organizations[0].id,
      },
    ]);
  });

  it("refuses a restaurant owned by another organization", async () => {
    const { state, tx } = createFakeTx([
      { slug: "chez-lea", status: "CLAIMED", organizationId: "org_someone" },
    ]);

    await expect(claimRestaurant(tx, completedCheckout())).rejects.toBeInstanceOf(
      RestaurantNotClaimableError,
    );
    expect(state.restaurants[0].organizationId).toBe("org_someone");
    expect(state.subscriptions).toHaveLength(0);
  });

  it("refuses a slug that does not exist", async () => {
    const { tx } = createFakeTx([]);

    await expect(claimRestaurant(tx, completedCheckout())).rejects.toBeInstanceOf(
      RestaurantNotClaimableError,
    );
  });

  it("refuses an owned restaurant whose organization was deleted", async () => {
    // `onDelete: SetNull` leaves a real customer's restaurant at
    // {CLAIMED, organizationId: null}. Treating that as claimable would hand
    // it to whoever checks out next, so it stays off limits.
    const { tx } = createFakeTx([
      { slug: "chez-lea", status: "CLAIMED", organizationId: null },
    ]);

    await expect(claimRestaurant(tx, completedCheckout())).rejects.toBeInstanceOf(
      RestaurantNotClaimableError,
    );
  });

  it("is idempotent when the other completion path already claimed it", async () => {
    const { state, tx } = createFakeTx([
      { slug: "chez-lea", status: "PROSPECT", organizationId: null },
    ]);

    await claimRestaurant(tx, completedCheckout());
    const organizationId = state.organizations[0].id;
    // The site has gone live since the first claim; a replayed webhook or a
    // reloaded success page must not knock it back to CLAIMED.
    state.restaurants[0].status = "LIVE";

    await claimRestaurant(tx, completedCheckout());

    expect(state.restaurants[0].status).toBe("LIVE");
    expect(state.restaurants[0].organizationId).toBe(organizationId);
    expect(state.organizations).toHaveLength(1);
    expect(state.subscriptions).toHaveLength(1);
  });

  it("reuses the buyer's existing organization for a second restaurant", async () => {
    const { state, tx } = createFakeTx([
      { slug: "chez-lea", status: "PROSPECT", organizationId: null },
      { slug: "chez-max", status: "PROSPECT", organizationId: null },
    ]);

    await claimRestaurant(tx, completedCheckout());
    await claimRestaurant(
      tx,
      completedCheckout({ restaurantSlug: "chez-max" }),
    );

    expect(state.organizations).toHaveLength(1);
    expect(state.restaurants.map((row) => row.organizationId)).toEqual([
      state.organizations[0].id,
      state.organizations[0].id,
    ]);
  });
});

describe("RestaurantNotClaimableError", () => {
  it("does not reveal whether the slug exists", () => {
    const error = new RestaurantNotClaimableError();
    expect(error.name).toBe("RestaurantNotClaimableError");
    expect(error.message).toBe("This restaurant is not available to claim");
    expect(error.message).not.toContain("not found");
  });
});

function completedCheckout(overrides: Partial<CompletedCheckoutInput> = {}) {
  return {
    email: "owner@chez-lea.test",
    restaurantSlug: "chez-lea",
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_1",
    stripePriceId: "price_1",
    ...overrides,
  };
}

type CompletedCheckoutInput = ReturnType<typeof completedCheckout>;

type RestaurantRow = {
  slug: string;
  status: string;
  organizationId: string | null;
};

type SubscriptionRow = {
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  status: string;
  organizationId: string;
};

/**
 * A tiny in-memory stand-in for a Prisma transaction. `updateMany` and `count`
 * apply the real WHERE clause the way Postgres would — every field ANDed, `in`
 * treated as set membership — so a guard that stops narrowing the update
 * shows up here as a test failure rather than a passing snapshot.
 */
function createFakeTx(restaurants: RestaurantRow[]) {
  const state = {
    restaurants,
    users: [] as Array<{ id: string; email: string }>,
    organizations: [] as Array<{ id: string; name: string }>,
    memberships: [] as Array<{ userId: string; organizationId: string }>,
    subscriptions: [] as SubscriptionRow[],
  };

  let sequence = 0;
  const nextId = (prefix: string) => `${prefix}_${(sequence += 1)}`;

  const fake = {
    user: {
      upsert: async ({ where, create }: UpsertUserArgs) => {
        const existing = state.users.find((user) => user.email === where.email);
        if (existing) return existing;
        const user = { id: nextId("user"), email: create.email };
        state.users.push(user);
        return user;
      },
    },
    membership: {
      findFirst: async ({ where }: { where: { userId: string } }) =>
        state.memberships.find(
          (membership) => membership.userId === where.userId,
        ) ?? null,
    },
    organization: {
      create: async ({ data }: CreateOrganizationArgs) => {
        const organization = { id: nextId("org"), name: data.name };
        state.organizations.push(organization);
        state.memberships.push({
          userId: data.memberships.create.userId,
          organizationId: organization.id,
        });
        return organization;
      },
    },
    restaurant: {
      updateMany: async ({ where, data }: UpdateRestaurantsArgs) => {
        const matched = state.restaurants.filter((row) => matches(row, where));
        for (const row of matched) Object.assign(row, data);
        return { count: matched.length };
      },
      count: async ({ where }: { where: WhereClause }) =>
        state.restaurants.filter((row) => matches(row, where)).length,
    },
    subscription: {
      upsert: async ({ where, update, create }: UpsertSubscriptionArgs) => {
        const existing = state.subscriptions.find(
          (row) => row.stripeCustomerId === where.stripeCustomerId,
        );
        if (existing) return Object.assign(existing, update);
        state.subscriptions.push(create);
        return create;
      },
    },
  };

  return { state, tx: fake as unknown as Prisma.TransactionClient };
}

type WhereClause = Record<string, unknown>;

type UpsertUserArgs = {
  where: { email: string };
  create: { email: string };
};

type CreateOrganizationArgs = {
  data: {
    name: string;
    memberships: { create: { userId: string; role: string } };
  };
};

type UpdateRestaurantsArgs = {
  where: WhereClause;
  data: Partial<RestaurantRow>;
};

type UpsertSubscriptionArgs = {
  where: { stripeCustomerId: string };
  update: Partial<SubscriptionRow>;
  create: SubscriptionRow;
};

function matches(row: RestaurantRow, where: WhereClause): boolean {
  return Object.entries(where).every(([field, condition]) => {
    const value = (row as Record<string, unknown>)[field];
    if (condition !== null && typeof condition === "object" && "in" in condition) {
      return (condition as { in: unknown[] }).in.includes(value);
    }
    return value === condition;
  });
}
