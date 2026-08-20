import { describe, expect, it } from "bun:test";
import {
  canApplyResendAuthEvent,
  RESEND_AUTH_EVENT_TRANSITIONS,
} from "@/lib/auth-delivery-policy";

describe("Resend authentication delivery ordering", () => {
  it("advances provider acceptance to confirmed delivery", () => {
    const sentAt = new Date("2026-08-20T10:00:00.000Z");
    const deliveredAt = new Date("2026-08-20T10:01:00.000Z");
    expect(
      canApplyResendAuthEvent({
        currentStatus: "SENT",
        currentEventAt: sentAt,
        eventType: "email.delivered",
        occurredAt: deliveredAt,
      }),
    ).toBe(true);
  });

  it("records a bounce after apparent delivery without regressing terminal state", () => {
    const deliveredAt = new Date("2026-08-20T10:01:00.000Z");
    const bouncedAt = new Date("2026-08-20T10:02:00.000Z");
    expect(
      canApplyResendAuthEvent({
        currentStatus: "DELIVERED",
        currentEventAt: deliveredAt,
        eventType: "email.bounced",
        occurredAt: bouncedAt,
      }),
    ).toBe(true);
    expect(
      canApplyResendAuthEvent({
        currentStatus: "BOUNCED",
        currentEventAt: bouncedAt,
        eventType: "email.delivered",
        occurredAt: new Date("2026-08-20T10:03:00.000Z"),
      }),
    ).toBe(false);
  });

  it("keeps suppression distinct and rejects stale events", () => {
    expect(RESEND_AUTH_EVENT_TRANSITIONS["email.suppressed"].status).toBe(
      "SUPPRESSED",
    );
    expect(
      canApplyResendAuthEvent({
        currentStatus: "SENT",
        currentEventAt: new Date("2026-08-20T10:02:00.000Z"),
        eventType: "email.failed",
        occurredAt: new Date("2026-08-20T10:01:59.000Z"),
      }),
    ).toBe(false);
  });
});
