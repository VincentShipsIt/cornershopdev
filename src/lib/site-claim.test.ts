import { describe, expect, it, spyOn } from "bun:test";
import type { Prisma } from "@/generated/prisma/client";
import {
  CLAIMABLE_STATUSES,
  claimSite,
  type CompletedCheckout,
  isClaimable,
  SiteNotClaimableError,
  unclaimedWhere,
} from "@/lib/site-claim";

describe("site claim eligibility", () => {
  it("accepts an unowned prospect", () => {
    expect(isClaimable({ status: "PROSPECT", organizationId: null })).toBe(true);
    expect(isClaimable({ status: "PREVIEW_READY", organizationId: null })).toBe(
      true,
    );
  });

  it("rejects a site that already belongs to an organization", () => {
    expect(isClaimable({ status: "PROSPECT", organizationId: "org_a" })).toBe(
      false,
    );
  });

  it("rejects a site that has moved past the prospect stage", () => {
    for (const status of ["CLAIMED", "LIVE", "PAUSED"] as const) {
      expect(isClaimable({ status, organizationId: null })).toBe(false);
    }
  });

  it("never treats a live or claimed site as claimable", () => {
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

describe("claimSite", () => {
  it("hands an unowned prospect to the buyer and records the subscription", async () => {
    const { state, tx } = createFakeTx([
      { slug: "chez-lea", status: "PREVIEW_READY", organizationId: null },
    ]);

    await claimSite(tx, completedCheckout());

    const site = state.sites[0];
    expect(site.status).toBe("CLAIMED");
    expect(site.organizationId).toBe(state.organizations[0].id);
    expect(state.subscriptions).toEqual([
      {
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "sub_1",
        stripePriceId: "price_1",
        status: "ACTIVE",
        currentPeriodEnd: new Date("2026-08-26T00:00:00.000Z"),
        cancelAtPeriodEnd: false,
        lastStripeEventAt: new Date("2026-07-26T00:00:00.000Z"),
        organizationId: state.organizations[0].id,
      },
    ]);
  });

  it("refuses a site owned by another organization", async () => {
    const { state, tx } = createFakeTx([
      { slug: "chez-lea", status: "CLAIMED", organizationId: "org_someone" },
    ]);

    const reported = await expectClaimRejected(tx);

    expect(reported).toMatchObject({
      slug: "chez-lea",
      stripeSubscriptionId: "sub_1",
    });
    expect(state.sites[0].organizationId).toBe("org_someone");
    expect(state.subscriptions).toHaveLength(0);
    // A hijack attempt writes nothing, without relying on the caller having
    // wrapped this in a transaction that rolls the organization back.
    expect(state.organizations).toHaveLength(0);
    expect(state.memberships).toHaveLength(0);
  });

  it("refuses a slug that does not exist", async () => {
    const { state, tx } = createFakeTx([]);

    await expectClaimRejected(tx);

    expect(state.organizations).toHaveLength(0);
  });

  it("refuses an owned site whose organization was deleted", async () => {
    // `onDelete: SetNull` leaves a real customer's site at
    // {CLAIMED, organizationId: null}. Treating that as claimable would hand
    // it to whoever checks out next, so it stays off limits.
    const { state, tx } = createFakeTx([
      { slug: "chez-lea", status: "CLAIMED", organizationId: null },
    ]);

    await expectClaimRejected(tx);

    expect(state.sites[0].organizationId).toBeNull();
    expect(state.organizations).toHaveLength(0);
  });

  it("is idempotent when the other completion path already claimed it", async () => {
    const { state, tx } = createFakeTx([
      { slug: "chez-lea", status: "PROSPECT", organizationId: null },
    ]);

    await claimSite(tx, completedCheckout());
    const organizationId = state.organizations[0].id;
    // The site has gone live since the first claim; a replayed webhook or a
    // reloaded success page must not knock it back to CLAIMED.
    state.sites[0].status = "LIVE";

    await claimSite(tx, completedCheckout());

    expect(state.sites[0].status).toBe("LIVE");
    expect(state.sites[0].organizationId).toBe(organizationId);
    expect(state.organizations).toHaveLength(1);
    expect(state.subscriptions).toHaveLength(1);
  });

  it("reuses the buyer's existing organization for a second site", async () => {
    const { state, tx } = createFakeTx([
      { slug: "chez-lea", status: "PROSPECT", organizationId: null },
      { slug: "chez-max", status: "PROSPECT", organizationId: null },
    ]);

    await claimSite(tx, completedCheckout());
    await claimSite(
      tx,
      completedCheckout({ siteSlug: "chez-max" }),
    );

    expect(state.organizations).toHaveLength(1);
    expect(state.sites.map((row) => row.organizationId)).toEqual([
      state.organizations[0].id,
      state.organizations[0].id,
    ]);
  });

  it("normalizes Stripe email before creating account identity", async () => {
    const { state, tx } = createFakeTx([
      { slug: "chez-lea", status: "PREVIEW_READY", organizationId: null },
    ]);

    await claimSite(
      tx,
      completedCheckout({ email: " Owner@Chez-Lea.TEST " }),
    );

    expect(state.users[0].email).toBe("owner@chez-lea.test");
  });

  it("does not let an older checkout event overwrite newer billing state", async () => {
    const { state, tx } = createFakeTx([
      { slug: "chez-lea", status: "PREVIEW_READY", organizationId: null },
    ]);
    await claimSite(
      tx,
      completedCheckout({
        subscriptionStatus: "PAST_DUE",
        stripeEventCreatedAt: new Date("2026-07-26T00:00:10.000Z"),
      }),
    );
    await claimSite(
      tx,
      completedCheckout({
        subscriptionStatus: "ACTIVE",
        stripeEventCreatedAt: new Date("2026-07-26T00:00:05.000Z"),
      }),
    );
    expect(state.subscriptions[0].status).toBe("PAST_DUE");
  });
});

describe("SiteNotClaimableError", () => {
  it("does not reveal whether the slug exists", () => {
    const error = new SiteNotClaimableError();
    expect(error.name).toBe("SiteNotClaimableError");
    expect(error.message).toBe("This site is not available to claim");
    expect(error.message).not.toContain("not found");
  });
});

/**
 * Asserts a claim is refused *and* that it left a trace. A rejected claim
 * means a real payment completed with nothing to show for it, so silence is
 * itself a bug — the log line is the only signal a human gets, since the
 * transaction rolls back before an audit row could survive. Spying also keeps
 * the expected error out of the CI output.
 */
async function expectClaimRejected(
  tx: Prisma.TransactionClient,
  checkout: CompletedCheckout = completedCheckout(),
): Promise<Record<string, unknown>> {
  const logged = spyOn(console, "error").mockImplementation(() => {});
  try {
    await expect(claimSite(tx, checkout)).rejects.toBeInstanceOf(
      SiteNotClaimableError,
    );
    expect(logged).toHaveBeenCalledTimes(1);
    return logged.mock.calls[0][1] as Record<string, unknown>;
  } finally {
    logged.mockRestore();
  }
}

/**
 * Typed against the exported `CompletedCheckout` rather than inferred from this
 * fixture, so a field added to the real checkout payload fails to compile here
 * instead of leaving the tests asserting against a shape Stripe no longer sends.
 */
function completedCheckout(
  overrides: Partial<CompletedCheckout> = {},
): CompletedCheckout {
  return {
    email: "owner@chez-lea.test",
    siteSlug: "chez-lea",
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_1",
    stripePriceId: "price_1",
    subscriptionStatus: "ACTIVE",
    currentPeriodEnd: new Date("2026-08-26T00:00:00.000Z"),
    cancelAtPeriodEnd: false,
    stripeEventCreatedAt: new Date("2026-07-26T00:00:00.000Z"),
    ...overrides,
  };
}

type SiteRow = {
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
  organizationId: string;
};

/**
 * A tiny in-memory stand-in for a Prisma transaction. `updateMany` and `count`
 * apply the real WHERE clause the way Postgres would — every field ANDed, `in`
 * treated as set membership — so a guard that stops narrowing the update
 * shows up here as a test failure rather than a passing snapshot.
 */
function createFakeTx(sites: SiteRow[]) {
  const state = {
    sites,
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
    site: {
      findUnique: async ({ where }: { where: { slug: string } }) =>
        state.sites.find((row) => row.slug === where.slug) ?? null,
      updateMany: async ({ where, data }: UpdateSitesArgs) => {
        const matched = state.sites.filter((row) => matches(row, where));
        for (const row of matched) Object.assign(row, data);
        return { count: matched.length };
      },
      count: async ({ where }: { where: WhereClause }) =>
        state.sites.filter((row) => matches(row, where)).length,
    },
    subscription: {
      findUnique: async ({
        where,
      }: {
        where: { stripeCustomerId: string };
      }) =>
        state.subscriptions.find(
          (row) => row.stripeCustomerId === where.stripeCustomerId,
        ) ?? null,
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

type UpdateSitesArgs = {
  where: WhereClause;
  data: Partial<SiteRow>;
};

type UpsertSubscriptionArgs = {
  where: { stripeCustomerId: string };
  update: Partial<SubscriptionRow>;
  create: SubscriptionRow;
};

function matches(row: SiteRow, where: WhereClause): boolean {
  return Object.entries(where).every(([field, condition]) => {
    const value = (row as Record<string, unknown>)[field];
    if (condition !== null && typeof condition === "object" && "in" in condition) {
      return (condition as { in: unknown[] }).in.includes(value);
    }
    return value === condition;
  });
}
