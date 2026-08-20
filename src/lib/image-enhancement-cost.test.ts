import { describe, expect, it } from "bun:test";
import { providerCostMicros } from "@/lib/ai/site-generation";

describe("image enhancement provider cost", () => {
  it("reads OpenRouter dollar usage as integer microdollars", () => {
    expect(
      providerCostMicros({ openrouter: { usage: { cost: "0.012345" } } }),
    ).toBe(12_345);
  });

  it("accepts direct microdollar metadata and rejects malformed values", () => {
    expect(providerCostMicros({ provider: { costMicros: 321.2 } })).toBe(322);
    expect(providerCostMicros({ provider: { usage: { cost: "free" } } })).toBe(
      null,
    );
  });
});
