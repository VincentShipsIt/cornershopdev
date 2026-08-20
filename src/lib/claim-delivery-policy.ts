import type { ClaimDeliveryStatus } from "@/generated/prisma/enums";

export const CLAIM_INVITATION_MAX_RETRIES = 3;

export function isClaimInvitationDeliveryRetryable(input: {
  deliveryStatus: ClaimDeliveryStatus;
  retryCount: number;
}): boolean {
  return (
    input.retryCount < CLAIM_INVITATION_MAX_RETRIES &&
    ["FAILED", "BOUNCED", "SUPPRESSED"].includes(input.deliveryStatus)
  );
}

export const RESEND_CLAIM_EVENT_TRANSITIONS = {
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
  { status: ClaimDeliveryStatus; from: readonly ClaimDeliveryStatus[] }
>;

export type ResendClaimEventType = keyof typeof RESEND_CLAIM_EVENT_TRANSITIONS;

export function canApplyResendClaimEvent(input: {
  currentStatus: ClaimDeliveryStatus;
  currentEventAt: Date | null;
  eventType: ResendClaimEventType;
  occurredAt: Date;
}): boolean {
  const transition = RESEND_CLAIM_EVENT_TRANSITIONS[input.eventType];
  return (
    transition.from.some((status) => status === input.currentStatus) &&
    (!input.currentEventAt || input.currentEventAt <= input.occurredAt)
  );
}

export function claimDeliveryFailureCode(
  eventType: ResendClaimEventType,
): string | null {
  if (eventType === "email.failed") return "provider_reported_failure";
  if (eventType === "email.suppressed") return "provider_suppressed";
  if (eventType === "email.bounced") return "recipient_bounced";
  if (eventType === "email.complained") return "recipient_complained";
  return null;
}
