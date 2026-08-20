import { describe, expect, it } from "bun:test";
import {
  evidenceDigest,
  integrationUrlDigest,
  sameJsonValue,
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

  it("compares persisted JSON objects independently of jsonb key ordering", () => {
    expect(
      sameJsonValue(
        { address: "Old address", phone: "1111" },
        { phone: "1111", address: "Old address" },
      ),
    ).toBe(true);
    expect(
      sameJsonValue(
        { address: "Old address", phone: "1111" },
        { phone: "2222", address: "Old address" },
      ),
    ).toBe(false);
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
