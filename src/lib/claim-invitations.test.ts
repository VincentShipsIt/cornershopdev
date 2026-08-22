import { describe, expect, it, mock } from "bun:test";
import {
  buildClaimCheckoutIdempotencyKey,
  claimInvitationTokenForOutreach,
  claimRevocationCheckoutIsCurrent,
  ClaimFlowError,
  expireCheckoutBeforeClaimRevocation,
  hasDomainEmailOwnershipProof,
  hashClaimInvitationToken,
  normalizeClaimApprovalEvidenceRef,
} from "@/lib/claim-invitations";
import { isClaimInvitationDeliveryRetryable } from "@/lib/claim-delivery-policy";

describe("claim invitation secrets", () => {
  it("correlates known replay rejections without retaining a bearer token", () => {
    const rejection = new ClaimFlowError(
      "invitation_used",
      409,
      "Already accepted",
      "invite_1",
    );

    expect(rejection).toMatchObject({
      code: "invitation_used",
      status: 409,
      invitationId: "invite_1",
    });
    expect(JSON.stringify(rejection)).not.toContain("claim_token");
  });

  it("stores a fixed SHA-256 digest rather than the bearer token", () => {
    const token = "a-private-one-time-token";
    const digest = hashClaimInvitationToken(token);

    expect(digest).toHaveLength(64);
    expect(digest).not.toContain(token);
    expect(hashClaimInvitationToken(token)).toBe(digest);
    expect(hashClaimInvitationToken(`${token}-other`)).not.toBe(digest);
  });

  it("derives one stable bearer token per secret-scoped outreach stage", () => {
    const environment = {
      CLAIM_TOKEN_SECRET: "test-only-secret-with-at-least-32-characters",
    };
    const key = "lead-outreach:site_1:preview_ready";
    const token = claimInvitationTokenForOutreach(key, environment);

    expect(claimInvitationTokenForOutreach(key, environment)).toBe(token);
    expect(
      claimInvitationTokenForOutreach(
        "lead-outreach:site_1:follow_up_1",
        environment,
      ),
    ).not.toBe(token);
    expect(token).not.toContain(key);
    expect(() => claimInvitationTokenForOutreach(key, {})).toThrow();
  });
});

describe("claim checkout idempotency", () => {
  it("binds the exact Stripe expiry to the idempotency key", () => {
    const input = {
      invitationId: "invite_1",
      plan: "founding" as const,
      previousSessionId: "cs_previous",
      expiresAt: 1_800_000_000,
    };

    expect(buildClaimCheckoutIdempotencyKey(input)).toBe(
      buildClaimCheckoutIdempotencyKey({ ...input }),
    );
    expect(
      buildClaimCheckoutIdempotencyKey({
        ...input,
        expiresAt: input.expiresAt + 1,
      }),
    ).not.toBe(buildClaimCheckoutIdempotencyKey(input));
  });
});

describe("operator approval evidence", () => {
  it("accepts a bounded non-sensitive CRM or consent reference", () => {
    expect(
      normalizeClaimApprovalEvidenceRef("  crm:owner-consent-1234  "),
    ).toBe("crm:owner-consent-1234");
  });

  it("rejects missing, free-form, and email-shaped evidence", () => {
    for (const value of [
      undefined,
      "short",
      "owner approved over the phone",
      "owner@example.test",
      "outreach-dispatch:forged",
    ]) {
      expect(() => normalizeClaimApprovalEvidenceRef(value)).toThrow(
        "Record a non-sensitive",
      );
    }
  });
});

describe("claim invitation delivery retry", () => {
  it("allows only bounded terminal delivery failures", () => {
    for (const deliveryStatus of ["FAILED", "BOUNCED", "SUPPRESSED"] as const) {
      expect(
        isClaimInvitationDeliveryRetryable({ deliveryStatus, retryCount: 2 }),
      ).toBe(true);
    }
    for (const deliveryStatus of ["PENDING", "SENT", "DELIVERED"] as const) {
      expect(
        isClaimInvitationDeliveryRetryable({ deliveryStatus, retryCount: 0 }),
      ).toBe(false);
    }
    expect(
      isClaimInvitationDeliveryRetryable({
        deliveryStatus: "FAILED",
        retryCount: 3,
      }),
    ).toBe(false);
  });
});

describe("checkout-bound claim revocation", () => {
  it("aborts if another Checkout binds after the Stripe safety check", () => {
    expect(claimRevocationCheckoutIsCurrent(null, "cs_new")).toBe(false);
    expect(
      claimRevocationCheckoutIsCurrent("cs_expired", "cs_replacement"),
    ).toBe(false);
    expect(
      claimRevocationCheckoutIsCurrent("cs_expired", "cs_expired"),
    ).toBe(true);
  });

  it("expires an open Stripe Checkout before the invitation can be revoked", async () => {
    const retrieve = mock(async () => ({ status: "open" }));
    const expire = mock(async () => ({ status: "expired" }));

    await expireCheckoutBeforeClaimRevocation(
      "cs_test_open",
      checkoutSessions(retrieve, expire),
    );

    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(expire).toHaveBeenCalledWith("cs_test_open");
  });

  it("refuses to revoke a completed Checkout", async () => {
    const retrieve = mock(async () => ({ status: "complete" }));
    const expire = mock(async () => ({ status: "expired" }));

    await expect(
      expireCheckoutBeforeClaimRevocation(
        "cs_test_paid",
        checkoutSessions(retrieve, expire),
      ),
    ).rejects.toMatchObject({ code: "checkout_completed", status: 409 });
    expect(expire).not.toHaveBeenCalled();
  });

  it("detects when payment wins the race against expiration", async () => {
    let retrieval = 0;
    const retrieve = mock(async () => ({
      status: retrieval++ === 0 ? "open" : "complete",
    }));
    const expire = mock(async () => {
      throw new Error("Checkout can no longer be expired");
    });

    await expect(
      expireCheckoutBeforeClaimRevocation(
        "cs_test_racing",
        checkoutSessions(retrieve, expire),
      ),
    ).rejects.toMatchObject({ code: "checkout_completed", status: 409 });
    expect(retrieve).toHaveBeenCalledTimes(2);
    expect(expire).toHaveBeenCalledTimes(1);
  });

  it("fails closed when Stripe does not confirm expiration", async () => {
    const retrieve = mock(async () => ({ status: "open" }));
    const expire = mock(async () => ({ status: "open" }));

    await expect(
      expireCheckoutBeforeClaimRevocation(
        "cs_test_unconfirmed",
        checkoutSessions(retrieve, expire),
      ),
    ).rejects.toThrow("Stripe Checkout did not expire");
  });
});

describe("self-serve domain email proof", () => {
  it("accepts the exact imported contact email", () => {
    expect(
      hasDomainEmailOwnershipProof(
        {
          sourceUrl: null,
          email: "Bookings@Chez-Lea.test",
        },
        " bookings@chez-lea.TEST ",
      ),
    ).toBe(true);
  });

  it("accepts the exact source hostname after removing leading www", () => {
    expect(
      hasDomainEmailOwnershipProof(
        {
          sourceUrl: "https://www.chez-lea.test/menu",
          email: null,
        },
        "owner@chez-lea.test",
      ),
    ).toBe(true);
  });

  it("does not strip www from the candidate email domain", () => {
    expect(
      hasDomainEmailOwnershipProof(
        {
          sourceUrl: "https://example.test/menu",
          email: null,
        },
        "owner@www.example.test",
      ),
    ).toBe(false);
  });

  it("does not guess parent, sibling or registrable domains", () => {
    const site = {
      sourceUrl: "https://restaurant.example.co.uk",
      email: null,
    };

    expect(
      hasDomainEmailOwnershipProof(site, "owner@example.co.uk"),
    ).toBe(false);
    expect(
      hasDomainEmailOwnershipProof(site, "owner@shop.example.co.uk"),
    ).toBe(false);
    expect(
      hasDomainEmailOwnershipProof(site, "owner@restaurant.example.co.uk"),
    ).toBe(true);
  });

  it("fails closed for malformed imported identity data", () => {
    expect(
      hasDomainEmailOwnershipProof(
        { sourceUrl: "not a URL", email: "not an email" },
        "owner@example.test",
      ),
    ).toBe(false);
  });
});

function checkoutSessions(
  retrieve: (...args: never[]) => Promise<{ status: string }>,
  expire: (...args: never[]) => Promise<{ status: string }>,
) {
  return { retrieve, expire } as unknown as Parameters<
    typeof expireCheckoutBeforeClaimRevocation
  >[1];
}
