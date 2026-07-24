import { describe, expect, it } from "bun:test";
import {
  CLAIMABLE_STATUSES,
  claimableWhere,
  isClaimable,
  RestaurantNotClaimableError,
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

describe("claimableWhere", () => {
  it("constrains the update to the requested slug", () => {
    expect(claimableWhere("chez-lea", "org_a").slug).toBe("chez-lea");
  });

  it("only matches unowned prospects or the caller's own restaurant", () => {
    expect(claimableWhere("chez-lea", "org_a").OR).toEqual([
      { organizationId: null, status: { in: CLAIMABLE_STATUSES } },
      { organizationId: "org_a" },
    ]);
  });

  it("does not match a restaurant owned by another organization", () => {
    // The filter carries no clause that a foreign-owned row could satisfy:
    // the unowned branch requires organizationId null, and the ownership
    // branch pins it to the claiming organization.
    const branches = claimableWhere("chez-lea", "org_a")
      .OR as Array<Record<string, unknown>>;
    const foreignOwned = { organizationId: "org_b", status: "CLAIMED" };

    for (const branch of branches) {
      const matches = Object.entries(branch).every(([key, value]) =>
        key === "status"
          ? CLAIMABLE_STATUSES.includes(
              foreignOwned.status as (typeof CLAIMABLE_STATUSES)[number],
            )
          : foreignOwned[key as "organizationId"] === value,
      );
      expect(matches).toBe(false);
    }
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
