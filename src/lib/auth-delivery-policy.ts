import type { AuthDeliveryStatus } from "@/generated/prisma/enums";

export const RESEND_AUTH_EVENT_TRANSITIONS = {
  "email.sent": { status: "SENT", from: ["PENDING", "SENT"] },
  "email.delivered": {
    status: "DELIVERED",
    from: ["PENDING", "SENT"],
  },
  "email.failed": { status: "FAILED", from: ["PENDING", "SENT"] },
  "email.suppressed": {
    status: "SUPPRESSED",
    from: ["PENDING", "SENT"],
  },
  "email.bounced": {
    status: "BOUNCED",
    from: ["PENDING", "SENT", "DELIVERED"],
  },
  "email.complained": {
    status: "SUPPRESSED",
    from: ["PENDING", "SENT", "DELIVERED"],
  },
} as const satisfies Record<
  string,
  { status: AuthDeliveryStatus; from: readonly AuthDeliveryStatus[] }
>;

export type ResendAuthEventType = keyof typeof RESEND_AUTH_EVENT_TRANSITIONS;

export function canApplyResendAuthEvent(input: {
  currentStatus: AuthDeliveryStatus;
  currentEventAt: Date | null;
  eventType: ResendAuthEventType;
  occurredAt: Date;
}): boolean {
  const transition = RESEND_AUTH_EVENT_TRANSITIONS[input.eventType];
  return (
    transition.from.some((status) => status === input.currentStatus) &&
    (!input.currentEventAt || input.currentEventAt <= input.occurredAt)
  );
}
