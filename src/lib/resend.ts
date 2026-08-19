import { Resend } from "resend";
import { resolveVerticalConfig } from "@/lib/verticals/registry";
import type { VerticalId } from "@/lib/verticals/types";

let resend: Resend | undefined;

export function getResend(): Resend {
  if (resend) return resend;
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
}

export const RESEND_SEND_TIMEOUT_MS = 8_000;

export type BoundedResendEmail = {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html?: string;
  text: string;
  headers?: Record<string, string>;
  tags: Array<{ name: string; value: string }>;
};

export type ReceivedResendEmail = {
  id: string;
  from: string;
  to: string[];
  subject: string;
  text: string | null;
  html: string | null;
  messageId: string | null;
  receivedFor: string[];
  headers: Record<string, string>;
};

/**
 * Sends through Resend's HTTP contract with an abort signal. The SDK version
 * installed here does not expose a request signal and converts network errors
 * into response-shaped values, which cannot safely fence a DB-held pause lock.
 */
export async function sendBoundedResendEmail(
  email: BoundedResendEmail,
  idempotencyKey: string,
): Promise<{
  data: { id: string } | null;
  error: { message: string; statusCode: number | null } | null;
}> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESEND_SEND_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        "User-Agent": "cornershopdev-restofront-outreach",
      },
      body: JSON.stringify({
        from: email.from,
        to: email.to,
        reply_to: email.replyTo,
        subject: email.subject,
        html: email.html,
        text: email.text,
        headers: email.headers,
        tags: email.tags,
      }),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => null)) as {
      id?: unknown;
      message?: unknown;
    } | null;
    if (response.ok && typeof payload?.id === "string") {
      return { data: { id: payload.id }, error: null };
    }
    return {
      data: null,
      error: {
        message:
          typeof payload?.message === "string"
            ? payload.message
            : "Resend rejected the request.",
        statusCode: response.status,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchReceivedResendEmail(
  emailId: string,
): Promise<ReceivedResendEmail | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESEND_SEND_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "User-Agent": "cornershopdev-restofront-outreach",
        },
        signal: controller.signal,
      },
    );
    if (response.status === 404) return null;
    const payload = (await response.json().catch(() => null)) as {
      id?: unknown;
      from?: unknown;
      to?: unknown;
      subject?: unknown;
      text?: unknown;
      html?: unknown;
      message_id?: unknown;
      received_for?: unknown;
      headers?: unknown;
    } | null;
    if (!response.ok || typeof payload?.id !== "string") {
      throw new Error("Received email could not be retrieved.");
    }
    return {
      id: payload.id,
      from: typeof payload.from === "string" ? payload.from : "",
      to: stringArray(payload.to),
      subject: typeof payload.subject === "string" ? payload.subject : "",
      text: typeof payload.text === "string" ? payload.text : null,
      html: typeof payload.html === "string" ? payload.html : null,
      messageId:
        typeof payload.message_id === "string" ? payload.message_id : null,
      receivedFor: stringArray(payload.received_for),
      headers: stringRecord(payload.headers),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) =>
      typeof entry === "string" ? [[key.toLowerCase(), entry]] : [],
    ),
  );
}

/**
 * Reads EMAIL_FROM and EMAIL_REPLY_TO. Deliberately an index signature rather
 * than those two names: `process.env` is a weak type under bun-types, so a
 * type listing only optional keys it does not declare is not assignable to it.
 * Same shape `platform-readiness` uses for the same reason.
 */
type EmailEnvironment = Record<string, string | undefined>;

/**
 * The niche's declared sending identity, or null when it has not launched one.
 * An absent vertical — a caller with no site in hand — resolves the same way, so
 * the environment fallback below covers both without a second branch.
 */
function nicheEmail(vertical: VerticalId | null | undefined) {
  return vertical ? resolveVerticalConfig(vertical).marketing.email : null;
}

/**
 * The address a message goes out as, resolved from the niche that owns the site
 * it concerns rather than from one platform-wide identity. A restaurant bought
 * Restofrontapp, so Restofrontapp is who writes to it — the same rule the wordmark
 * already follows, applied to the envelope.
 *
 * EMAIL_FROM survives only as the floor for a niche with no verified sending
 * domain of its own. The resend.dev fallback beneath it reaches a developer
 * machine and nothing else; a blank value counts as unset, because Resend
 * rejects an empty `from` outright and a half-filled `.env` should not break
 * sign-in.
 */
export function emailSender(
  vertical?: VerticalId | null,
  environment: EmailEnvironment = process.env,
): string {
  return (
    nicheEmail(vertical)?.from ||
    environment.EMAIL_FROM ||
    "Cornershopdev <onboarding@resend.dev>"
  );
}

/**
 * Where a reply lands. Senders are send-only subdomains nobody reads, so without
 * this a recipient who hits reply is talking to a black hole. Undefined leaves
 * the header off, which is the prior behaviour.
 */
export function emailReplyTo(
  vertical?: VerticalId | null,
  environment: EmailEnvironment = process.env,
): string | undefined {
  return (
    nicheEmail(vertical)?.replyTo || environment.EMAIL_REPLY_TO || undefined
  );
}
