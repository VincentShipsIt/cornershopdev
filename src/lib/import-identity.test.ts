import { describe, expect, it } from "bun:test";
import {
  buildImportUrls,
  importFailureMessage,
  normalizeImportSource,
  slugCollisionCandidate,
  storedImportSource,
} from "@/lib/import-identity";

describe("import identity", () => {
  it("normalizes equivalent website sources to one key", () => {
    expect(
      normalizeImportSource(
        "https://www.Example.com/menu/?utm_source=campaign#lunch",
      ),
    ).toBe("url:example.com/menu");
    expect(normalizeImportSource("example.com/menu/")).toBe(
      "url:example.com/menu",
    );
  });

  it("normalizes name-only sources without losing unicode identity", () => {
    expect(normalizeImportSource("  Café   Roma  ")).toBe("name:café roma");
  });

  it("removes credentials and fragments from the recorded source", () => {
    expect(
      storedImportSource(
        "https://operator:private@example.com/menu?locale=fr#lunch",
      ),
    ).toBe("https://example.com/menu?locale=fr");
  });

  it("generates stable collision suffixes within the slug limit", () => {
    const base = "a".repeat(72);
    expect(slugCollisionCandidate(base, 0)).toHaveLength(72);
    expect(slugCollisionCandidate(base, 1)).toBe(`${"a".repeat(70)}-2`);
  });
});

describe("import results", () => {
  it("returns canonical private preview and claim URLs", () => {
    expect(buildImportUrls("chez-léa")).toEqual({
      preview: "/preview/chez-l%C3%A9a",
      claim: "/claim/chez-l%C3%A9a",
    });
  });

  it("redacts credentials from durable failure details", () => {
    const message = importFailureMessage(
      new Error(
        "postgresql://admin:secret@db.example.test/cornershopdev token=private",
      ),
    );

    expect(message).toBe(
      "postgresql://[redacted]@db.example.test/cornershopdev token=[redacted]",
    );
    expect(message).not.toContain("admin:secret");
    expect(message).not.toContain("private");
  });
});
