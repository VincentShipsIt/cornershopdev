import { describe, expect, it } from "bun:test";
import {
  buildClaimCheckoutIdempotencyKey,
  hasDomainEmailOwnershipProof,
  hashClaimInvitationToken,
} from "@/lib/claim-invitations";

describe("claim invitation secrets", () => {
  it("stores a fixed SHA-256 digest rather than the bearer token", () => {
    const token = "a-private-one-time-token";
    const digest = hashClaimInvitationToken(token);

    expect(digest).toHaveLength(64);
    expect(digest).not.toContain(token);
    expect(hashClaimInvitationToken(token)).toBe(digest);
    expect(hashClaimInvitationToken(`${token}-other`)).not.toBe(digest);
  });
});

describe("claim checkout idempotency", () => {
  it("binds the exact Stripe expiry to the idempotency key", () => {
    const input = {
      invitationId: "invite_1",
      plan: "growth" as const,
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
