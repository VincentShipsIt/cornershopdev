import { describe, expect, it } from "bun:test";
import {
  createCheckoutReturnState,
  hashClaimInvitationToken,
  verifyCheckoutReturnState,
} from "@/lib/claim-security";

const secret = "test-secret-with-at-least-thirty-two-characters";

describe("claim invitation security", () => {
  it("stores only a deterministic one-way token digest", () => {
    const token = "invite-token-that-is-never-persisted";
    const digest = hashClaimInvitationToken(token);
    expect(digest).toHaveLength(64);
    expect(digest).not.toContain(token);
    expect(hashClaimInvitationToken(token)).toBe(digest);
  });

  it("binds checkout returns to one invitation", () => {
    const state = createCheckoutReturnState("invite_1", secret);
    expect(verifyCheckoutReturnState("invite_1", state, secret)).toBe(true);
    expect(verifyCheckoutReturnState("invite_2", state, secret)).toBe(false);
    expect(verifyCheckoutReturnState("invite_1", `${state}x`, secret)).toBe(
      false,
    );
  });
});
