import { Resend } from "resend";

let resend: Resend | undefined;

export function getResend(): Resend {
  if (resend) return resend;
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
}

/**
 * The sending identity every outbound message shares, so one verified domain
 * covers all of them. The resend.dev fallback only reaches a developer machine;
 * deployments set EMAIL_FROM. A blank value counts as unset — Resend rejects an
 * empty `from` outright, and a half-filled `.env` should not break sign-in.
 */
export function emailSender(environment: EmailEnvironment = process.env): string {
  return environment.EMAIL_FROM || "Restofront <onboarding@resend.dev>";
}

/**
 * Where a reply to a platform email lands. EMAIL_FROM points at a send-only
 * subdomain nobody reads, so without this a recipient who hits reply is talking
 * to a black hole. Unset leaves the header off, which is the prior behaviour.
 */
export function platformReplyTo(
  environment: EmailEnvironment = process.env,
): string | undefined {
  return environment.EMAIL_REPLY_TO || undefined;
}

/**
 * Reads EMAIL_FROM and EMAIL_REPLY_TO. Deliberately an index signature rather
 * than those two names: `process.env` is a weak type under bun-types, so a
 * type listing only optional keys it does not declare is not assignable to it.
 * Same shape `platform-readiness` uses for the same reason.
 */
type EmailEnvironment = Record<string, string | undefined>;
