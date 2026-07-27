import { describe, expect, it } from "bun:test";
import {
  createAuthorizationPolicy,
  type AuthorizationAdapter,
} from "@/lib/authorization-policy";
import { isSameOriginMutation } from "@/lib/request-origin";

describe("owner integration save boundary", () => {
  it("rejects a slug outside the signed-in owner's site before any tenant read", async () => {
    let queried = false;
    const policy = createAuthorizationPolicy(
      adapter({
        onFindSite: () => {
          queried = true;
        },
      }),
    );

    expect(await policy.getSiteAccess("another-restaurant")).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(queried).toBe(false);
  });

  it("revalidates current membership for the exact site on every save", async () => {
    const policy = createAuthorizationPolicy(adapter({ member: false }));

    expect(await policy.getSiteAccess("osteria-luna")).toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it("requires a same-origin browser mutation for cookie-authorized saves", () => {
    const crossSite = new Request(
      "https://cornershop.dev/api/sites/osteria-luna",
      {
        method: "PUT",
        headers: {
          origin: "https://attacker.example",
          "sec-fetch-site": "cross-site",
        },
      },
    );
    const sameSite = new Request(
      "https://cornershop.dev/api/sites/osteria-luna",
      {
        method: "PUT",
        headers: { origin: "https://cornershop.dev" },
      },
    );

    expect(isSameOriginMutation(crossSite, { requireOrigin: true })).toBe(
      false,
    );
    expect(isSameOriginMutation(sameSite, { requireOrigin: true })).toBe(true);
  });
});

function adapter({
  member = true,
  onFindSite,
}: {
  member?: boolean;
  onFindSite?: () => void;
} = {}): AuthorizationAdapter {
  return {
    isDatabaseConfigured: () => true,
    getSession: async () => ({
      userId: "owner_1",
      siteSlug: "osteria-luna",
    }),
    findSiteForMember: async () => {
      onFindSite?.();
      return member
        ? {
            id: "site_1",
            slug: "osteria-luna",
            vertical: "RESTAURANT",
            organizationId: "org_1",
            user: { id: "owner_1", email: "owner@example.com" },
          }
        : null;
    },
    findUser: async () => ({
      id: "owner_1",
      email: "owner@example.com",
      platformRole: "USER",
    }),
    isSuperadminEmail: () => false,
  };
}
