import { describe, expect, it } from "bun:test";
import {
  configuredOperatorAlertRecipients,
  operatorAlertFingerprint,
  operatorAlertRetryAt,
  safeAlertText,
} from "@/lib/operator-alert-policy";

describe("operator alert policy", () => {
  it("deduplicates the same incident within a bounded window", () => {
    const input = {
      kind: "PUBLISH_FAILURE" as const,
      dedupKey: "site_1",
    };
    expect(
      operatorAlertFingerprint({
        ...input,
        occurredAt: new Date("2026-07-27T12:01:00Z"),
      }),
    ).toBe(
      operatorAlertFingerprint({
        ...input,
        occurredAt: new Date("2026-07-27T12:14:59Z"),
      }),
    );
    expect(
      operatorAlertFingerprint({
        ...input,
        occurredAt: new Date("2026-07-27T12:15:00Z"),
      }),
    ).not.toBe(
      operatorAlertFingerprint({
        ...input,
        occurredAt: new Date("2026-07-27T12:14:59Z"),
      }),
    );
  });

  it("uses a bounded retry schedule", () => {
    const now = new Date("2026-07-27T12:00:00Z");
    expect(operatorAlertRetryAt(1, now).toISOString()).toBe(
      "2026-07-27T12:01:00.000Z",
    );
    expect(operatorAlertRetryAt(2, now).toISOString()).toBe(
      "2026-07-27T12:05:00.000Z",
    );
    expect(() => operatorAlertRetryAt(3, now)).toThrow(
      "No retry is scheduled after terminal attempt 3",
    );
  });

  it("normalizes recipients and rejects missing delivery configuration", () => {
    expect(
      configuredOperatorAlertRecipients({
        OPERATOR_ALERT_EMAILS: " Ops@example.com,ops@example.com ",
        RESEND_API_KEY: "configured",
      }),
    ).toEqual(["ops@example.com"]);
    expect(() => configuredOperatorAlertRecipients({})).toThrow(
      "OPERATOR_ALERT_EMAILS",
    );
  });

  it("bounds and flattens alert text", () => {
    expect(safeAlertText(" one\n two three ", 9)).toBe("one two t");
  });
});
