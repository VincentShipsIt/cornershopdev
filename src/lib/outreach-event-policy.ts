import type { OutreachStatus } from "@/generated/prisma/enums";

export const RESEND_OUTREACH_EVENT_TRANSITIONS = {
  "email.sent": { status: "SENT", from: ["QUEUED"] },
  "email.delivered": {
    status: "DELIVERED",
    from: ["QUEUED", "SENT"],
  },
  "email.failed": { status: "FAILED", from: ["QUEUED", "SENT"] },
  "email.suppressed": { status: "FAILED", from: ["QUEUED", "SENT"] },
  "email.bounced": {
    status: "BOUNCED",
    from: ["QUEUED", "SENT", "DELIVERED"],
  },
  "email.complained": {
    status: "COMPLAINED",
    from: ["QUEUED", "SENT", "DELIVERED"],
  },
} as const satisfies Record<
  string,
  { status: OutreachStatus; from: readonly OutreachStatus[] }
>;

export type ResendOutreachEventType =
  keyof typeof RESEND_OUTREACH_EVENT_TRANSITIONS;

export function canApplyResendOutreachEvent(input: {
  currentStatus: OutreachStatus;
  currentEventAt: Date | null;
  eventType: ResendOutreachEventType;
  occurredAt: Date;
}): boolean {
  const transition = RESEND_OUTREACH_EVENT_TRANSITIONS[input.eventType];
  return (
    transition.from.some((status) => status === input.currentStatus) &&
    (!input.currentEventAt || input.currentEventAt <= input.occurredAt)
  );
}
