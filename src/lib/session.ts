import { createHash, randomBytes } from "node:crypto";
import { secureCookieRequired } from "@/lib/first-customer-test-mode";

export const SESSION_COOKIE = "cornershopdev_session";
export const PENDING_MAGIC_LINK_COOKIE = "cornershopdev_pending_magic_link";
export const MAGIC_LINK_TTL_MS = 20 * 60_000;
export const MAGIC_LINK_MAX_RETRIES = 2;
export const MAGIC_LINK_PENDING_RETRY_AFTER_MS = 5 * 60_000;

export type OpaqueAuthToken = {
  token: string;
  tokenHash: string;
};

export function createOpaqueAuthToken(): OpaqueAuthToken {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashAuthToken(token) };
}

export function hashAuthToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function pendingMagicLinkCookieOptions() {
  return {
    httpOnly: true,
    secure: secureCookieRequired(),
    sameSite: "strict" as const,
    maxAge: MAGIC_LINK_TTL_MS / 1_000,
    path: "/",
    priority: "high" as const,
  };
}

export function maskAccountEmail(email: string): string {
  const separator = email.lastIndexOf("@");
  if (separator <= 0) return "hidden";
  const local = email.slice(0, separator);
  const domain = email.slice(separator + 1);
  return `${local.slice(0, 1)}${"*".repeat(Math.min(6, Math.max(2, local.length - 1)))}@${domain}`;
}

export type MagicLinkRetrySnapshot = {
  deliveryStatus:
    | "PENDING"
    | "SENT"
    | "DELIVERED"
    | "BOUNCED"
    | "SUPPRESSED"
    | "FAILED";
  retryCount: number;
  consumedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  lastAttemptAt: Date | null;
};

export function canRetryMagicLink(
  link: MagicLinkRetrySnapshot,
  now = new Date(),
): boolean {
  if (
    link.consumedAt ||
    link.revokedAt ||
    link.deliveryStatus === "SENT" ||
    link.deliveryStatus === "DELIVERED" ||
    link.retryCount >= MAGIC_LINK_MAX_RETRIES
  ) {
    return false;
  }
  if (
    link.deliveryStatus === "FAILED" ||
    link.deliveryStatus === "BOUNCED" ||
    link.deliveryStatus === "SUPPRESSED"
  ) {
    return true;
  }
  if (link.deliveryStatus !== "PENDING") return false;
  const lastActivityAt = link.lastAttemptAt ?? link.createdAt;
  return (
    now.getTime() - lastActivityAt.getTime() >=
    MAGIC_LINK_PENDING_RETRY_AFTER_MS
  );
}
