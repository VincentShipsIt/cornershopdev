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

type EmailEnvironment = {
  EMAIL_FROM?: string;
  EMAIL_REPLY_TO?: string;
};
