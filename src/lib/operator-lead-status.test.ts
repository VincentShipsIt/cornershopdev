import { describe, expect, it } from "bun:test";
import {
  buildOperatorLeadRollup,
  getOperatorInvitationState,
  isOperatorReviewCurrent,
} from "@/lib/operator-lead-status";

describe("operator invitation state", () => {
  const future = new Date("2026-08-01T00:00:00.000Z");
  const now = new Date("2026-07-27T00:00:00.000Z");

  it("distinguishes active, checkout-bound and terminal invitations", () => {
    expect(
      getOperatorInvitationState(
        {
          expiresAt: future,
          verifiedAt: null,
          acceptedAt: null,
          revokedAt: null,
          checkoutSessionId: null,
        },
        now,
      ),
    ).toBe("ACTIVE");
    expect(
      getOperatorInvitationState(
        {
          expiresAt: future,
          verifiedAt: now,
          acceptedAt: null,
          revokedAt: null,
          checkoutSessionId: "cs_1",
        },
        now,
      ),
    ).toBe("CHECKOUT_STARTED");
    expect(
      getOperatorInvitationState(
        {
          expiresAt: future,
          verifiedAt: now,
          acceptedAt: now,
          revokedAt: null,
          checkoutSessionId: "cs_1",
        },
        now,
      ),
    ).toBe("ACCEPTED");
  });

  it("does not present an expired or revoked invitation as actionable", () => {
    const expired = new Date("2026-07-26T00:00:00.000Z");
    expect(
      getOperatorInvitationState(
        {
          expiresAt: expired,
          verifiedAt: null,
          acceptedAt: null,
          revokedAt: null,
          checkoutSessionId: null,
        },
        now,
      ),
    ).toBe("EXPIRED");
    expect(
      getOperatorInvitationState(
        {
          expiresAt: future,
          verifiedAt: null,
          acceptedAt: null,
          revokedAt: now,
          checkoutSessionId: null,
        },
        now,
      ),
    ).toBe("REVOKED");
  });
});

describe("operator blocker rollup", () => {
  it("invalidates a review when the private draft changes later", () => {
    expect(
      isOperatorReviewCurrent(
        new Date("2026-07-27T10:00:00.000Z"),
        new Date("2026-07-27T09:00:00.000Z"),
      ),
    ).toBe(true);
    expect(
      isOperatorReviewCurrent(
        new Date("2026-07-27T09:00:00.000Z"),
        new Date("2026-07-27T10:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("shows the complete launch path without hiding domain readiness", () => {
    const stages = buildOperatorLeadRollup({
      importStatus: "READY",
      reviewedAt: new Date("2026-07-27T00:00:00.000Z"),
      ownerCount: 1,
      invitationState: "ACCEPTED",
      subscriptionStatus: "ACTIVE",
      domainCount: 1,
      verifiedDomainCount: 1,
      isPublished: true,
    });

    expect(stages.map(({ stage }) => stage)).toEqual([
      "import",
      "content_review",
      "claim",
      "checkout",
      "domain_tls",
      "publish",
    ]);
    expect(stages.every(({ status }) => status === "complete")).toBe(true);
  });

  it("keeps a private preview blocked until review, claim and billing finish", () => {
    const stages = buildOperatorLeadRollup({
      importStatus: "READY",
      reviewedAt: null,
      ownerCount: 0,
      invitationState: "ACTIVE",
      subscriptionStatus: null,
      domainCount: 0,
      verifiedDomainCount: 0,
      isPublished: false,
    });

    expect(stages.find(({ stage }) => stage === "claim")?.status).toBe("ready");
    expect(stages.find(({ stage }) => stage === "content_review")?.status).toBe(
      "blocked",
    );
    expect(stages.find(({ stage }) => stage === "checkout")?.status).toBe(
      "blocked",
    );
    expect(stages.find(({ stage }) => stage === "publish")?.status).toBe(
      "blocked",
    );
  });
});
