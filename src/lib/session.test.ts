import { describe, expect, it } from "bun:test";
import {
  canRetryMagicLink,
  createOpaqueAuthToken,
  hashAuthToken,
  MAGIC_LINK_MAX_RETRIES,
  maskAccountEmail,
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
    };
    expect(
      canRetryMagicLink({ ...base, consumedAt: now }, now),
    ).toBe(false);
    expect(
      canRetryMagicLink({ ...base, revokedAt: now }, now),
    ).toBe(false);
    expect(
      canRetryMagicLink(
        { ...base, retryCount: MAGIC_LINK_MAX_RETRIES },
        now,
      ),
    ).toBe(false);
  });
});

describe("operator-safe account display", () => {
  it("masks the local part without hiding the delivery domain", () => {
    expect(maskAccountEmail("owner@example.com")).toBe("o****@example.com");
    expect(maskAccountEmail("a@example.com")).toBe("a**@example.com");
  });
});
