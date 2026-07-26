import { describe, expect, it } from "bun:test";
import {
  createAuthorizationPolicy,
  type AuthorizationAdapter,
  type SiteAccessRecord,
} from "@/lib/authorization-policy";
import {
  configuredSuperadminEmails,
  isConfiguredSuperadminEmail,
} from "@/lib/superadmin-config";

describe("superadmin environment allowlist", () => {
  it("normalizes case, whitespace and duplicates", () => {
    expect(
      [...configuredSuperadminEmails(" Owner@Example.com,ops@example.com, owner@example.com ")],
    ).toEqual(["owner@example.com", "ops@example.com"]);
  });

  it("fails closed when the allowlist is absent", () => {
    expect(isConfiguredSuperadminEmail("owner@example.com", undefined)).toBe(
      false,
    );
  });

  it("matches normalized addresses only", () => {
    expect(
      isConfiguredSuperadminEmail(
        "OWNER@example.com",
        "owner@example.com,ops@example.com",
      ),
    ).toBe(true);
    expect(
      isConfiguredSuperadminEmail(
        "attacker@example.com",
        "owner@example.com,ops@example.com",
      ),
    ).toBe(false);
  });
});

const siteRecord: SiteAccessRecord = {
  id: "site_1",
  slug: "chez-lea",
  vertical: "RESTAURANT",
  organizationId: "org_1",
  user: { id: "user_1", email: "owner@example.com" },
};

describe("site authorization", () => {
  it("rejects an unauthenticated request", async () => {
    const policy = createAuthorizationPolicy(
      adapter({ session: null, site: siteRecord }),
    );

    expect(await policy.getSiteAccess("chez-lea")).toEqual({
      ok: false,
      status: 401,
      message: "Unauthorized",
    });
  });

  it("rejects a different slug before querying tenant data", async () => {
    let queried = false;
    const policy = createAuthorizationPolicy(
      adapter({
        site: siteRecord,
        onFindSite: () => {
          queried = true;
        },
      }),
    );

    expect(await policy.getSiteAccess("another-site")).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(queried).toBe(false);
  });

  it("revokes access when current membership is absent", async () => {
    const policy = createAuthorizationPolicy(adapter({ site: null }));

    expect(await policy.getSiteAccess("chez-lea")).toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it("returns only the currently authorized site and user", async () => {
    const policy = createAuthorizationPolicy(adapter({ site: siteRecord }));

    expect(await policy.getSiteAccess("chez-lea")).toEqual({
      ok: true,
      session: { userId: "user_1", siteSlug: "chez-lea" },
      site: {
        id: "site_1",
        slug: "chez-lea",
        vertical: "RESTAURANT",
        organizationId: "org_1",
      },
      user: { id: "user_1", email: "owner@example.com" },
    });
  });
});

describe("superadmin authorization", () => {
  it("requires both the database role and environment allowlist", async () => {
    const roleOnly = createAuthorizationPolicy(
      adapter({
        user: {
          id: "user_1",
          email: "owner@example.com",
          platformRole: "SUPERADMIN",
        },
        allowedSuperadminEmail: null,
      }),
    );
    const allowlistOnly = createAuthorizationPolicy(
      adapter({
        user: {
          id: "user_1",
          email: "owner@example.com",
          platformRole: "USER",
        },
        allowedSuperadminEmail: "owner@example.com",
      }),
    );

    expect(await roleOnly.getSuperadminAccess()).toBeNull();
    expect(await allowlistOnly.getSuperadminAccess()).toBeNull();
  });

  it("admits the exact dual-gated operator", async () => {
    const policy = createAuthorizationPolicy(
      adapter({
        user: {
          id: "user_1",
          email: "owner@example.com",
          platformRole: "SUPERADMIN",
        },
        allowedSuperadminEmail: "owner@example.com",
      }),
    );

    expect(await policy.getSuperadminAccess()).toEqual({
      id: "user_1",
      email: "owner@example.com",
    });
  });
});

function adapter(
  overrides: {
    session?: { userId: string; siteSlug: string | null } | null;
    site?: SiteAccessRecord | null;
    user?: Awaited<ReturnType<AuthorizationAdapter["findUser"]>>;
    allowedSuperadminEmail?: string | null;
    onFindSite?: () => void;
  } = {},
): AuthorizationAdapter {
  return {
    isDatabaseConfigured: () => true,
    getSession: async () =>
      "session" in overrides
        ? (overrides.session ?? null)
        : { userId: "user_1", siteSlug: "chez-lea" },
    findSiteForMember: async () => {
      overrides.onFindSite?.();
      return "site" in overrides ? (overrides.site ?? null) : siteRecord;
    },
    findUser: async () =>
      overrides.user ?? {
        id: "user_1",
        email: "owner@example.com",
        platformRole: "USER",
      },
    isSuperadminEmail: (email) =>
      email === overrides.allowedSuperadminEmail,
  };
}
