import { describe, expect, it } from "bun:test";
import {
  canApplyResendOutreachEvent,
  RESEND_OUTREACH_EVENT_TRANSITIONS,
} from "@/lib/outreach-event-policy";

describe("Resend outreach event ordering", () => {
  it("advances queued mail through sent and delivered", () => {
    const sentAt = new Date("2026-08-19T08:01:00.000Z");
    const deliveredAt = new Date("2026-08-19T08:02:00.000Z");

    expect(
      canApplyResendOutreachEvent({
        currentStatus: "QUEUED",
        currentEventAt: null,
        eventType: "email.sent",
        occurredAt: sentAt,
      }),
    ).toBe(true);
    expect(
      canApplyResendOutreachEvent({
        currentStatus: "SENT",
        currentEventAt: sentAt,
        eventType: "email.delivered",
        occurredAt: deliveredAt,
      }),
    ).toBe(true);
  });

  it("never regresses terminal suppression on delayed or newer events", () => {
    const terminalAt = new Date("2026-08-19T08:05:00.000Z");
    for (const currentStatus of [
      "FAILED",
      "BOUNCED",
      "COMPLAINED",
    ] as const) {
      for (const eventType of ["email.sent", "email.delivered"] as const) {
        expect(
          canApplyResendOutreachEvent({
            currentStatus,
            currentEventAt: terminalAt,
            eventType,
            occurredAt: new Date("2026-08-19T08:06:00.000Z"),
          }),
        ).toBe(false);
      }
    }
  });

  it("treats suppressed delivery as a required terminal failure", () => {
    expect(RESEND_OUTREACH_EVENT_TRANSITIONS["email.suppressed"]).toEqual({
      status: "FAILED",
      from: ["QUEUED", "SENT"],
    });
  });

  it("ignores an event older than the last provider transition", () => {
    expect(
      canApplyResendOutreachEvent({
        currentStatus: "SENT",
        currentEventAt: new Date("2026-08-19T08:05:00.000Z"),
        eventType: "email.delivered",
        occurredAt: new Date("2026-08-19T08:04:59.000Z"),
      }),
    ).toBe(false);
  });
});
