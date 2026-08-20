import { createHash } from "node:crypto";

export const OPERATOR_ALERT_MAX_ATTEMPTS = 3;
export const OPERATOR_ALERT_DEDUP_WINDOW_MS = 15 * 60_000;
export const OPERATOR_ALERT_LEASE_MS = 2 * 60_000;
export const OPERATOR_ALERT_DISPATCH_BATCH_SIZE = 5;
export const OPERATOR_ALERT_DELIVERY_TIMEOUT_MS = 5_000;

const OPERATOR_ALERT_RETRY_DELAYS_MS = [60_000, 5 * 60_000] as const;

export type OperatorAlertKind =
  | "CHECKOUT_WEBHOOK_FAILURE"
  | "PUBLISH_FAILURE"
  | "PUBLIC_SITE_HEALTH_FAILURE"
  | "OUTREACH_SEND_FAILURE"
  | "OUTREACH_REPLY";

export type AlertDeliveryOutcome =
  | "delivered"
  | "pending"
  | "exhausted"
  | "deduplicated"
  | "fallback-delivered"
  | "unavailable";

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
  const delay = OPERATOR_ALERT_RETRY_DELAYS_MS[attempt - 1];
  if (delay === undefined) {
    throw new Error(
      `No retry is scheduled after terminal attempt ${OPERATOR_ALERT_MAX_ATTEMPTS}.`,
    );
  }
  return new Date(now.getTime() + delay);
}

export function operatorAlertFailureState(
  attempt: number,
  now: Date,
):
  | { status: "PENDING"; nextAttemptAt: Date }
  | { status: "EXHAUSTED" } {
  if (attempt >= OPERATOR_ALERT_MAX_ATTEMPTS) {
    return { status: "EXHAUSTED" };
  }
  return {
    status: "PENDING",
    nextAttemptAt: operatorAlertRetryAt(attempt, now),
  };
}

export async function dispatchOperatorAlertBatch(
  ids: string[],
  deliver: (id: string) => Promise<AlertDeliveryOutcome>,
): Promise<Record<AlertDeliveryOutcome, number>> {
  const totals = emptyOutcomeTotals();
  for (const id of ids) {
    try {
      totals[await deliver(id)] += 1;
    } catch {
      totals.pending += 1;
    }
  }
  return totals;
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

function emptyOutcomeTotals(): Record<AlertDeliveryOutcome, number> {
  return {
    delivered: 0,
    pending: 0,
    exhausted: 0,
    deduplicated: 0,
    "fallback-delivered": 0,
    unavailable: 0,
  };
}
