import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const SESSION_COOKIE = "restofront_session";

const sessionPayloadSchema = z.object({
  email: z.email(),
  siteSlug: z.string().min(2).max(80),
  expiresAt: z.number().int().positive(),
});

export type SessionPayload = z.infer<typeof sessionPayloadSchema>;

function secret(): string {
  const value = process.env.CLAIM_TOKEN_SECRET;
  if (!value || value.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("CLAIM_TOKEN_SECRET must contain at least 32 characters");
    }
    return "restofront-development-secret-change-me";
  }
  return value;
}

function signature(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function createSessionToken(
  input: Omit<SessionPayload, "expiresAt"> & { expiresAt?: number },
): string {
  const payload = sessionPayloadSchema.parse({
    ...input,
    expiresAt: input.expiresAt ?? Date.now() + 30 * 24 * 60 * 60 * 1000,
  });
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const [encoded, suppliedSignature] = token.split(".");
    if (!encoded || !suppliedSignature) return null;
    const expected = signature(encoded);
    const suppliedBuffer = Buffer.from(suppliedSignature);
    const expectedBuffer = Buffer.from(expected);
    if (
      suppliedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(suppliedBuffer, expectedBuffer)
    ) {
      return null;
    }
    const payload = sessionPayloadSchema.parse(
      JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")),
    );
    return payload.expiresAt > Date.now() ? payload : null;
  } catch {
    return null;
  }
}
