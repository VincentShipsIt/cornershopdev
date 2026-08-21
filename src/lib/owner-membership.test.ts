import { describe, expect, it } from "bun:test";
import {
  OWNER_MEMBERSHIP_ROLE,
  ownedSiteSessionWhere,
  ownerMembershipWhere,
} from "@/lib/owner-membership";

describe("owner membership filters", () => {
  it("always scopes owner-only relations to the owner role", () => {
    expect(ownerMembershipWhere()).toEqual({ role: "owner" });
    expect(OWNER_MEMBERSHIP_ROLE).toBe("owner");
  });

  it("combines immutable user identity with the owner role", () => {
    expect(ownerMembershipWhere("user_1")).toEqual({
      userId: "user_1",
      role: "owner",
    });
  });

  it("invalidates a bound SITE session when its current owner membership is removed", () => {
    expect(
      ownedSiteSessionWhere({
        siteId: "site_1",
        organizationId: "organization_1",
        userId: "user_1",
      }),
    ).toEqual({
      id: "site_1",
      organizationId: "organization_1",
      organization: {
        memberships: {
          some: { userId: "user_1", role: "owner" },
        },
      },
    });
  });
});
