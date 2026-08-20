import { describe, expect, it } from "bun:test";
import {
  evidenceDigest,
  integrationUrlDigest,
} from "@/lib/evidence-digests";

describe("redacted evidence digests", () => {
  it("is stable across object key ordering but sensitive to content", () => {
    expect(evidenceDigest({ b: 2, a: { d: 4, c: 3 } })).toBe(
      evidenceDigest({ a: { c: 3, d: 4 }, b: 2 }),
    );
    expect(evidenceDigest({ value: "before" })).not.toBe(
      evidenceDigest({ value: "after" }),
    );
  });

  it("proves integration destinations without exposing them", () => {
    const url = "https://booking.example.test/private-venue-id";
    const digest = integrationUrlDigest([
      { type: "booking", url, enabled: true },
    ]);

    expect(digest).toHaveLength(64);
    expect(digest).not.toContain(url);
  });
});
