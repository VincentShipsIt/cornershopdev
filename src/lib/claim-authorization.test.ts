import { describe, expect, it } from "bun:test";
import { isClaimInvitationAuthorized } from "@/lib/claim-authorization";

const invitation = {
  email: "owner@example.test",
  expiresAt: new Date("2026-07-27T00:00:00.000Z"),
  acceptedAt: null,
  site: {
    slug: "chez-lea",
    status: "PREVIEW_READY" as const,
    organizationId: null,
  },
};
const now = new Date("2026-07-26T00:00:00.000Z");

describe("claim checkout authorization", () => {
  it("accepts only the invitation's normalized email and site", () => {
    expect(
      isClaimInvitationAuthorized(invitation, {
        siteSlug: "chez-lea",
        email: " OWNER@EXAMPLE.TEST ",
        now,
      }),
    ).toBe(true);
    expect(
      isClaimInvitationAuthorized(invitation, {
        siteSlug: "another-site",
        email: "owner@example.test",
        now,
      }),
    ).toBe(false);
  });

  it("rejects expired, accepted and already-owned claims", () => {
    expect(
      isClaimInvitationAuthorized(
        { ...invitation, expiresAt: now },
        { siteSlug: "chez-lea", email: invitation.email, now },
      ),
    ).toBe(false);
    expect(
      isClaimInvitationAuthorized(
        { ...invitation, acceptedAt: now },
        { siteSlug: "chez-lea", email: invitation.email, now },
      ),
    ).toBe(false);
    expect(
      isClaimInvitationAuthorized(
        {
          ...invitation,
          site: { ...invitation.site, organizationId: "org_other" },
        },
        { siteSlug: "chez-lea", email: invitation.email, now },
      ),
    ).toBe(false);
  });
});
