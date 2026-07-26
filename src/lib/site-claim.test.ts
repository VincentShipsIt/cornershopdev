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
  it("admits only unowned prospects", () => {
    expect(isClaimable({ status: "PROSPECT", organizationId: null })).toBe(true);
    expect(isClaimable({ status: "PREVIEW_READY", organizationId: null })).toBe(
      true,
    );
    expect(isClaimable({ status: "CLAIMED", organizationId: null })).toBe(false);
    expect(isClaimable({ status: "PROSPECT", organizationId: "org_1" })).toBe(
      false,
    );
  });

  it("pins the compare-and-swap to slug, ownership and lifecycle", () => {
    expect(unclaimedWhere("chez-lea")).toEqual({
      slug: "chez-lea",
      organizationId: null,
      status: { in: CLAIMABLE_STATUSES },
    });
  });
});

describe("invitation-bound site claim", () => {
  it("atomically accepts the invitation, assigns ownership and audits it", async () => {
    const { state, tx } = fixture();

    const access = await claimSite(tx, completedCheckout());

    expect(state.invitations[0].acceptedAt).toBeInstanceOf(Date);
    expect(state.sites[0]).toMatchObject({
      status: "CLAIMED",
      organizationId: access.organizationId,
    });
    expect(state.subscriptions).toHaveLength(1);
    expect(state.auditEvents).toEqual([
      expect.objectContaining({
        type: "claim.invitation.accepted",
        siteId: "site_1",
        metadata: {
          invitationId: "invite_1",
          proofMethod: "DOMAIN_EMAIL",
        },
      }),
    ]);
  });

  it("replays the same completed Stripe session idempotently", async () => {
    const { state, tx } = fixture();

    const first = await claimSite(tx, completedCheckout());
    state.sites[0].status = "LIVE";
    const replay = await claimSite(tx, completedCheckout());

    expect(replay).toEqual(first);
    expect(state.sites[0].status).toBe("LIVE");
    expect(state.organizations).toHaveLength(1);
    expect(state.auditEvents).toHaveLength(1);
  });

  it("rejects cross-site, cross-email and cross-session use", async () => {
    for (const checkout of [
      completedCheckout({ siteSlug: "another-site" }),
      completedCheckout({ email: "attacker@example.test" }),
      completedCheckout({ stripeCheckoutSessionId: "cs_other" }),
    ]) {
      const { state, tx } = fixture();
      await expectRejected(tx, checkout);
      expect(state.sites[0].organizationId).toBeNull();
      expect(state.invitations[0].acceptedAt).toBeNull();
    }
  });

  it("rejects expired and revoked invitations", async () => {
    for (const invitation of [
      { expiresAt: new Date("2020-01-01"), revokedAt: null },
      { expiresAt: new Date("2099-01-01"), revokedAt: new Date() },
    ]) {
      const { state, tx } = fixture({ invitation });
      await expectRejected(tx);
      expect(state.sites[0].organizationId).toBeNull();
    }
  });

  it("does not transfer a site that already has an owner", async () => {
    const { state, tx } = fixture({
      site: { status: "CLAIMED", organizationId: "org_someone" },
    });

    await expectRejected(tx);

    expect(state.sites[0].organizationId).toBe("org_someone");
    expect(state.invitations[0].acceptedAt).toBeNull();
    expect(state.organizations).toHaveLength(0);
  });

  it("does not accept another invitation after ownership was established", async () => {
    const { state, tx } = fixture({
      invitations: [
        invitation(),
        invitation({
          id: "invite_2",
          email: "second@chez-lea.test",
          checkoutSessionId: "cs_second",
        }),
      ],
    });
    await claimSite(tx, completedCheckout());

    await expectRejected(
      tx,
      completedCheckout({
        email: "second@chez-lea.test",
        claimInvitationId: "invite_2",
        stripeCheckoutSessionId: "cs_second",
      }),
    );

    expect(state.sites[0].organizationId).toBe(state.organizations[0].id);
    expect(state.invitations[1].acceptedAt).toBeNull();
  });

  it("reuses an existing buyer organization for another invited site", async () => {
    const { state, tx } = fixture({
      sites: [
        site(),
        site({ id: "site_2", slug: "chez-max" }),
      ],
      invitations: [
        invitation(),
        invitation({
          id: "invite_2",
          siteId: "site_2",
          checkoutSessionId: "cs_second",
        }),
      ],
    });

    await claimSite(tx, completedCheckout());
    await claimSite(
      tx,
      completedCheckout({
        siteSlug: "chez-max",
        claimInvitationId: "invite_2",
        stripeCheckoutSessionId: "cs_second",
        stripeCustomerId: "cus_2",
        stripeSubscriptionId: "sub_2",
      }),
    );

    expect(state.organizations).toHaveLength(1);
    expect(state.sites.map((row) => row.organizationId)).toEqual([
      state.organizations[0].id,
      state.organizations[0].id,
    ]);
  });
});

describe("SiteNotClaimableError", () => {
  it("does not expose ownership or invitation internals", () => {
    const error = new SiteNotClaimableError();
    expect(error.message).toBe("This site is not available to claim");
    expect(error.message).not.toContain("invitation");
  });
});

async function expectRejected(
  tx: Prisma.TransactionClient,
  checkout: CompletedCheckout = completedCheckout(),
) {
  const logged = spyOn(console, "error").mockImplementation(() => {});
  try {
    await expect(claimSite(tx, checkout)).rejects.toBeInstanceOf(
      SiteNotClaimableError,
    );
    expect(logged).toHaveBeenCalledTimes(1);
  } finally {
    logged.mockRestore();
  }
}

function completedCheckout(
  overrides: Partial<CompletedCheckout> = {},
): CompletedCheckout {
  return {
    email: "owner@chez-lea.test",
    siteSlug: "chez-lea",
    claimInvitationId: "invite_1",
    stripeCheckoutSessionId: "cs_1",
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_1",
    stripePriceId: "price_1",
    ...overrides,
  };
}

type SiteRow = {
  id: string;
  slug: string;
  status: string;
  organizationId: string | null;
};

type InvitationRow = {
  id: string;
  email: string;
  proofMethod: string;
  expiresAt: Date;
  verifiedAt: Date | null;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  checkoutSessionId: string | null;
  siteId: string;
};

type SubscriptionRow = {
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  status: string;
  organizationId: string;
};

function site(overrides: Partial<SiteRow> = {}): SiteRow {
  return {
    id: "site_1",
    slug: "chez-lea",
    status: "PREVIEW_READY",
    organizationId: null,
    ...overrides,
  };
}

function invitation(
  overrides: Partial<InvitationRow> = {},
): InvitationRow {
  return {
    id: "invite_1",
    email: "owner@chez-lea.test",
    proofMethod: "DOMAIN_EMAIL",
    expiresAt: new Date("2099-01-01"),
    verifiedAt: new Date(),
    acceptedAt: null,
    revokedAt: null,
    checkoutSessionId: "cs_1",
    siteId: "site_1",
    ...overrides,
  };
}

function fixture(
  overrides: {
    site?: Partial<SiteRow>;
    sites?: SiteRow[];
    invitation?: Partial<InvitationRow>;
    invitations?: InvitationRow[];
  } = {},
) {
  const state = {
    sites: overrides.sites ?? [site(overrides.site)],
    invitations:
      overrides.invitations ?? [invitation(overrides.invitation)],
    users: [] as Array<{ id: string; email: string }>,
    organizations: [] as Array<{ id: string; name: string }>,
    memberships: [] as Array<{ userId: string; organizationId: string }>,
    subscriptions: [] as SubscriptionRow[],
    auditEvents: [] as Array<Record<string, unknown>>,
  };
  let sequence = 0;
  const nextId = (prefix: string) => `${prefix}_${(sequence += 1)}`;

  const fake = {
    claimInvitation: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = state.invitations.find((item) => item.id === where.id);
        if (!row) return null;
        const ownedSite = state.sites.find((item) => item.id === row.siteId);
        return ownedSite ? { ...row, site: { ...ownedSite } } : null;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: WhereClause;
        data: Partial<InvitationRow>;
      }) => {
        const rows = state.invitations.filter((row) => matches(row, where));
        for (const row of rows) Object.assign(row, data);
        return { count: rows.length };
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
        const found = state.users.find((user) => user.email === where.email);
        if (found) return found;
        const created = { id: nextId("user"), email: create.email };
        state.users.push(created);
        return created;
      },
    },
    membership: {
      findFirst: async ({
        where,
      }: {
        where: { userId: string; organizationId?: string };
      }) =>
        state.memberships.find(
          (row) =>
            row.userId === where.userId &&
            (!where.organizationId ||
              row.organizationId === where.organizationId),
        ) ?? null,
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
        const created = { id: nextId("org"), name: data.name };
        state.organizations.push(created);
        state.memberships.push({
          userId: data.memberships.create.userId,
          organizationId: created.id,
        });
        return created;
      },
    },
    site: {
      updateMany: async ({
        where,
        data,
      }: {
        where: WhereClause;
        data: Partial<SiteRow>;
      }) => {
        const rows = state.sites.filter((row) => matches(row, where));
        for (const row of rows) Object.assign(row, data);
        return { count: rows.length };
      },
    },
    subscription: {
      upsert: async ({
        where,
        update,
        create,
      }: {
        where: { stripeCustomerId: string };
        update: Partial<SubscriptionRow>;
        create: SubscriptionRow;
      }) => {
        const found = state.subscriptions.find(
          (row) => row.stripeCustomerId === where.stripeCustomerId,
        );
        if (found) return Object.assign(found, update);
        state.subscriptions.push(create);
        return create;
      },
    },
    auditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.auditEvents.push(data);
        return data;
      },
    },
  };

  return { state, tx: fake as unknown as Prisma.TransactionClient };
}

type WhereClause = Record<string, unknown>;

function matches(row: object, where: WhereClause): boolean {
  return Object.entries(where).every(([field, condition]) => {
    if (field === "OR") {
      return (condition as WhereClause[]).some((branch) => matches(row, branch));
    }
    const value = (row as Record<string, unknown>)[field];
    if (condition !== null && typeof condition === "object") {
      if ("in" in condition) {
        return (condition as { in: unknown[] }).in.includes(value);
      }
      if ("gt" in condition) {
        return (
          value instanceof Date &&
          value > (condition as { gt: Date }).gt
        );
      }
    }
    return value === condition;
  });
}
