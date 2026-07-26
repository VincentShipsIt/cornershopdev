import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const developmentSecret = "cornershopdev-development-secret-change-me";

export function getClaimTokenSecret(
  env: Record<string, string | undefined> = process.env,
): string {
  const value = env.CLAIM_TOKEN_SECRET;
  if (!value || value.length < 32) {
    if (env.NODE_ENV === "production") {
      throw new Error("CLAIM_TOKEN_SECRET must contain at least 32 characters");
    }
    return developmentSecret;
  }
  return value;
}

/**
 * Claim invitation bearer tokens are never persisted. Only this deterministic
 * digest is compared with ClaimInvitation.tokenHash.
 */
export function hashClaimInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createCheckoutReturnState(
  claimInvitationId: string,
  secret = getClaimTokenSecret(),
): string {
  return createHmac("sha256", secret)
    .update(`stripe-checkout-return:${claimInvitationId}`)
    .digest("base64url");
}

export function verifyCheckoutReturnState(
  claimInvitationId: string,
  supplied: string,
  secret = getClaimTokenSecret(),
): boolean {
  const expected = createCheckoutReturnState(claimInvitationId, secret);
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return (
    suppliedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
}
