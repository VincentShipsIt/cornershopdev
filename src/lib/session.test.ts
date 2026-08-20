import { describe, expect, it } from "bun:test";
import {
  canRetryMagicLink,
  createOpaqueAuthToken,
  hashAuthToken,
  MAGIC_LINK_MAX_RETRIES,
  MAGIC_LINK_TTL_MS,
  maskAccountEmail,
  pendingMagicLinkCookieOptions,
} from "@/lib/session";

describe("opaque authentication tokens", () => {
  it("stores only a deterministic one-way digest", () => {
    const issued = createOpaqueAuthToken();

    expect(issued.token).toHaveLength(43);
    expect(issued.tokenHash).toHaveLength(64);
    expect(issued.tokenHash).toBe(hashAuthToken(issued.token));
    expect(issued.tokenHash).not.toContain(issued.token);
    expect(createOpaqueAuthToken().tokenHash).not.toBe(issued.tokenHash);
  });
});

describe("magic-link retries", () => {
  const now = new Date("2026-07-27T12:00:00.000Z");
  const stale = new Date("2026-07-27T11:50:00.000Z");

  it("retries failed and stale pending deliveries only", () => {
    expect(
      canRetryMagicLink(
        {
          deliveryStatus: "FAILED",
          retryCount: 0,
          consumedAt: null,
          revokedAt: null,
          createdAt: now,
          lastAttemptAt: now,
          rotationGeneration: 2,
          authLinkSequence: 2,
        },
        now,
      ),
    ).toBe(true);
    expect(
      canRetryMagicLink(
        {
          deliveryStatus: "PENDING",
          retryCount: 0,
          consumedAt: null,
          revokedAt: null,
          createdAt: stale,
          lastAttemptAt: stale,
          rotationGeneration: 2,
          authLinkSequence: 2,
        },
        now,
      ),
    ).toBe(true);
    expect(
      canRetryMagicLink(
        {
          deliveryStatus: "SENT",
          retryCount: 0,
          consumedAt: null,
          revokedAt: null,
          createdAt: stale,
          lastAttemptAt: stale,
          rotationGeneration: 2,
          authLinkSequence: 2,
        },
        now,
      ),
    ).toBe(false);
    expect(
      canRetryMagicLink(
        {
          deliveryStatus: "DELIVERED",
          retryCount: 0,
          consumedAt: null,
          revokedAt: null,
          createdAt: stale,
          lastAttemptAt: stale,
          rotationGeneration: 2,
          authLinkSequence: 2,
        },
        now,
      ),
    ).toBe(false);
  });

  it("stops terminal and exhausted retry chains", () => {
    const base = {
      deliveryStatus: "FAILED" as const,
      retryCount: 0,
      consumedAt: null,
      revokedAt: null,
      createdAt: stale,
      lastAttemptAt: stale,
      rotationGeneration: 2,
      authLinkSequence: 2,
    };
    expect(canRetryMagicLink({ ...base, consumedAt: now }, now)).toBe(false);
    expect(canRetryMagicLink({ ...base, revokedAt: now }, now)).toBe(true);
    expect(
      canRetryMagicLink({ ...base, retryCount: MAGIC_LINK_MAX_RETRIES }, now),
    ).toBe(false);
    expect(canRetryMagicLink({ ...base, deliveryStatus: "BOUNCED" }, now)).toBe(
      true,
    );
    expect(
      canRetryMagicLink({ ...base, deliveryStatus: "SUPPRESSED" }, now),
    ).toBe(true);
    expect(
      canRetryMagicLink({
        ...base,
        rotationGeneration: 1,
      }, now),
    ).toBe(false);
    expect(
      canRetryMagicLink({
        ...base,
        deliveryStatus: "PENDING",
        revokedAt: now,
      }, now),
    ).toBe(false);
  });
});

describe("magic-link scanner protection", () => {
  it("stages the pending credential in a short-lived strict HttpOnly cookie", () => {
    expect(pendingMagicLinkCookieOptions()).toMatchObject({
      httpOnly: true,
      sameSite: "strict",
      maxAge: MAGIC_LINK_TTL_MS / 1_000,
      path: "/",
    });
  });
});

describe("operator-safe account display", () => {
  it("masks the local part without hiding the delivery domain", () => {
    expect(maskAccountEmail("owner@example.com")).toBe("o****@example.com");
    expect(maskAccountEmail("a@example.com")).toBe("a**@example.com");
  });
});
