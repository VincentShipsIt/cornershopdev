import { describe, expect, it } from "bun:test";
import { leadBatchRequestSchema } from "@/lib/operator-lead-batch";

describe("leadBatchRequestSchema", () => {
  it("accepts a minimal batch and applies defaults", () => {
    const result = leadBatchRequestSchema.parse({
      leads: [{ source: "https://example.com" }],
    });

    expect(result.leads).toHaveLength(1);
    expect(result.leads[0]?.vertical).toBe("RESTAURANT");
    expect(result.sendEmail).toBe(true);
    expect(result.followUpDelayHours).toBeUndefined();
  });

  it("accepts a full batch with an explicit vertical, contact email, and delay", () => {
    const result = leadBatchRequestSchema.parse({
      leads: [
        {
          source: "https://example.com",
          vertical: "BEAUTY",
          contactEmail: "owner@example.com",
        },
      ],
      sendEmail: false,
      followUpDelayHours: 48,
    });

    expect(result.leads[0]?.vertical).toBe("BEAUTY");
    expect(result.leads[0]?.contactEmail).toBe("owner@example.com");
    expect(result.sendEmail).toBe(false);
    expect(result.followUpDelayHours).toBe(48);
  });

  it("rejects an empty leads array", () => {
    expect(() => leadBatchRequestSchema.parse({ leads: [] })).toThrow();
  });

  it("rejects a batch larger than 20 leads", () => {
    const leads = Array.from({ length: 21 }, (_, index) => ({
      source: `https://example.com/${index}`,
    }));
    expect(() => leadBatchRequestSchema.parse({ leads })).toThrow();
  });

  it("rejects a lead source shorter than 2 characters", () => {
    expect(() =>
      leadBatchRequestSchema.parse({ leads: [{ source: "a" }] }),
    ).toThrow();
  });

  it("rejects an invalid contact email", () => {
    expect(() =>
      leadBatchRequestSchema.parse({
        leads: [{ source: "https://example.com", contactEmail: "not-an-email" }],
      }),
    ).toThrow();
  });

  it("rejects a non-positive follow-up delay", () => {
    expect(() =>
      leadBatchRequestSchema.parse({
        leads: [{ source: "https://example.com" }],
        followUpDelayHours: 0,
      }),
    ).toThrow();
  });

  it("rejects a follow-up delay longer than 30 days", () => {
    expect(() =>
      leadBatchRequestSchema.parse({
        leads: [{ source: "https://example.com" }],
        followUpDelayHours: 24 * 31,
      }),
    ).toThrow();
  });
});
