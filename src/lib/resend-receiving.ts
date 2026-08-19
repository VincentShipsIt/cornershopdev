import { RESEND_SEND_TIMEOUT_MS } from "@/lib/resend";

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
 * Fetches a received inbound message from Resend. Kept off `@/lib/resend` so
 * tests can mock receiving without replacing `emailSender` process-wide.
 */
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
