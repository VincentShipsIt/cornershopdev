import type { OutreachStatus } from "@/generated/prisma/enums";

/** Stay inside Resend's documented 24-hour idempotency-key lifetime. */
export const PROVIDER_IDEMPOTENCY_WINDOW_MS = 23 * 60 * 60_000;

export function isOutreachMessageRetryable(
  message: {
    status: OutreachStatus | string;
    providerEventAt: Date | null;
    createdAt: Date;
  },
  now = new Date(),
): boolean {
  return (
    message.status === "FAILED" &&
    message.providerEventAt === null &&
    now.getTime() - message.createdAt.getTime() <
      PROVIDER_IDEMPOTENCY_WINDOW_MS
  );
}

/**
 * A concrete 4xx request rejection is known not to have been accepted. A
 * timeout, conflict, rate limit, network failure, or 5xx is ambiguous and must
 * stay QUEUED for webhook/operator reconciliation instead of being resent.
 */
export function isDefinitiveResendRejection(
  statusCode: number | null | undefined,
): boolean {
  return (
    typeof statusCode === "number" &&
    statusCode >= 400 &&
    statusCode < 500 &&
    ![408, 409, 425, 429].includes(statusCode)
  );
}
