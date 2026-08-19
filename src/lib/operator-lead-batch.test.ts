import { describe, expect, it } from "bun:test";
import { leadBatchRequestSchema } from "@/lib/operator-lead-batch";

describe("leadBatchRequestSchema", () => {
  it("accepts a minimal batch and applies defaults", () => {
    const result = leadBatchRequestSchema.parse({
      leads: [{ source: "https://example.com" }],
    });

    expect(result.leads).toHaveLength(1);
    expect(result.leads[0]?.vertical).toBe("RESTAURANT");
    expect(result.sendEmail).toBe(false);
  });

  it("accepts a full non-sending batch with a vertical and contact email", () => {
    const result = leadBatchRequestSchema.parse({
      leads: [
        {
          source: "https://example.com",
          vertical: "BEAUTY",
          contactEmail: "Owner@Example.COM",
        },
      ],
      sendEmail: false,
    });

    expect(result.leads[0]?.vertical).toBe("BEAUTY");
    expect(result.leads[0]?.contactEmail).toBe("owner@example.com");
    expect(result.sendEmail).toBe(false);
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

  it("rejects any attempt to send while creating leads", () => {
    expect(() =>
      leadBatchRequestSchema.parse({
        leads: [{ source: "https://example.com" }],
        sendEmail: true,
      }),
    ).toThrow();
  });
});
