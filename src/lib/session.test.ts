import { afterEach, describe, expect, it } from "bun:test";
import { createSessionToken, verifySessionToken } from "@/lib/session";

const originalSecret = process.env.CLAIM_TOKEN_SECRET;

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.CLAIM_TOKEN_SECRET;
  } else {
    process.env.CLAIM_TOKEN_SECRET = originalSecret;
  }
});

describe("signed sessions", () => {
  it("round-trips the minimum account identity", () => {
    process.env.CLAIM_TOKEN_SECRET =
      "test-session-secret-with-at-least-thirty-two-characters";
    const token = createSessionToken({
      userId: "user_123",
      siteSlug: "chez-lea",
      expiresAt: Date.now() + 60_000,
    });

    expect(verifySessionToken(token)).toMatchObject({
      userId: "user_123",
      siteSlug: "chez-lea",
    });
  });

  it("supports a platform operator with no client site", () => {
    process.env.CLAIM_TOKEN_SECRET =
      "test-session-secret-with-at-least-thirty-two-characters";
    const token = createSessionToken({
      userId: "user_admin",
      expiresAt: Date.now() + 60_000,
    });

    expect(verifySessionToken(token)).toMatchObject({
      userId: "user_admin",
      siteSlug: null,
    });
  });

  it("rejects a modified token", () => {
    process.env.CLAIM_TOKEN_SECRET =
      "test-session-secret-with-at-least-thirty-two-characters";
    const token = createSessionToken({
      userId: "user_123",
      siteSlug: "chez-lea",
      expiresAt: Date.now() + 60_000,
    });

    expect(verifySessionToken(`${token}tampered`)).toBeNull();
  });
});
