import { createHash } from "node:crypto";

export const OPERATOR_ALERT_MAX_ATTEMPTS = 3;
export const OPERATOR_ALERT_DEDUP_WINDOW_MS = 15 * 60_000;
export const OPERATOR_ALERT_LEASE_MS = 2 * 60_000;

export type OperatorAlertKind =
  | "CHECKOUT_WEBHOOK_FAILURE"
  | "PUBLISH_FAILURE"
  | "PUBLIC_SITE_HEALTH_FAILURE"
  | "OUTREACH_SEND_FAILURE";

type Environment = Record<string, string | undefined>;

export function operatorAlertFingerprint(input: {
  kind: OperatorAlertKind;
  dedupKey: string;
  occurredAt: Date;
}): string {
  const bucket = Math.floor(
    input.occurredAt.getTime() / OPERATOR_ALERT_DEDUP_WINDOW_MS,
  );
  return createHash("sha256")
    .update(`${input.kind}:${input.dedupKey}:${bucket}`)
    .digest("hex");
}

export function operatorAlertRetryAt(
  attempt: number,
  now: Date,
): Date {
  const delays = [60_000, 5 * 60_000, 15 * 60_000];
  return new Date(now.getTime() + (delays[attempt - 1] ?? delays.at(-1)!));
}

export function configuredOperatorAlertRecipients(
  env: Environment = process.env,
): string[] {
  const recipients = [
    ...new Set(
      (env.OPERATOR_ALERT_EMAILS ?? "")
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (
    recipients.length === 0 ||
    recipients.length > 10 ||
    recipients.some(
      (value) =>
        value.length > 320 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    )
  ) {
    throw new Error(
      "OPERATOR_ALERT_EMAILS must contain valid comma-separated addresses.",
    );
  }
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is required for operator alert delivery.");
  }
  return recipients;
}

export function safeAlertText(value: string, maxLength: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}
