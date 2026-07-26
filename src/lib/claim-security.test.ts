import { describe, expect, it } from "bun:test";
import {
  createCheckoutReturnToken,
  hashClaimInvitationToken,
  verifyHashedToken,
} from "@/lib/claim-security";

describe("claim invitation security", () => {
  it("stores only a deterministic one-way token digest", () => {
    const token = "invite-token-that-is-never-persisted";
    const digest = hashClaimInvitationToken(token);
    expect(digest).toHaveLength(64);
    expect(digest).not.toContain(token);
    expect(hashClaimInvitationToken(token)).toBe(digest);
  });

  it("creates a high-entropy return token whose digest can be stored", () => {
    const first = createCheckoutReturnToken();
    const second = createCheckoutReturnToken();
    expect(first.token).not.toBe(second.token);
    expect(first.tokenHash).toBe(hashClaimInvitationToken(first.token));
    expect(first.tokenHash).not.toContain(first.token);
    expect(verifyHashedToken(first.token, first.tokenHash)).toBe(true);
    expect(verifyHashedToken(second.token, first.tokenHash)).toBe(false);
  });
});
