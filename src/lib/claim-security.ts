import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

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

export function createCheckoutReturnToken(): {
  token: string;
  tokenHash: string;
} {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashClaimInvitationToken(token) };
}

export function verifyHashedToken(
  suppliedToken: string,
  expectedHash: string,
): boolean {
  const suppliedHash = Buffer.from(hashClaimInvitationToken(suppliedToken));
  const expected = Buffer.from(expectedHash);
  return (
    suppliedHash.length === expected.length &&
    timingSafeEqual(suppliedHash, expected)
  );
}
