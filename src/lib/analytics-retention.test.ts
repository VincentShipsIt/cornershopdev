import { describe, expect, it } from "bun:test";
import {
  ANALYTICS_RETENTION_DAYS,
  analyticsRetentionCutoff,
} from "@/lib/analytics-retention";

describe("analytics retention", () => {
  it("retains raw events for 120 rolling days", () => {
    const now = new Date("2026-07-26T18:00:00.000Z");

    expect(ANALYTICS_RETENTION_DAYS).toBe(120);
    expect(analyticsRetentionCutoff(now).toISOString()).toBe(
      "2026-03-28T18:00:00.000Z",
    );
  });

  it("does not mutate the supplied clock", () => {
    const now = new Date("2026-07-26T18:00:00.000Z");

    analyticsRetentionCutoff(now);

    expect(now.toISOString()).toBe("2026-07-26T18:00:00.000Z");
  });

  it("rejects an invalid clock", () => {
    expect(() => analyticsRetentionCutoff(new Date("invalid"))).toThrow(
      RangeError,
    );
  });
});
