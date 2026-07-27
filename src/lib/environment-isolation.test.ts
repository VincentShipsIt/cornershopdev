import { describe, expect, it } from "bun:test";
import {
  fingerprintDatabaseIdentity,
  verifyDatabaseIsolation,
} from "@/lib/environment-isolation";

describe("database environment isolation evidence", () => {
  it("returns only opaque identities for different managed databases", () => {
    const evidence = verifyDatabaseIsolation({
      productionUrl:
        "postgresql://production:secret@rds.example.test:5432/cornershop_prod",
      previewUrl:
        "postgresql://preview:other@rds.example.test:5432/cornershop_preview",
    });

    expect(evidence.isolated).toBe(true);
    expect(evidence.productionIdentity).toHaveLength(64);
    expect(evidence.previewIdentity).toHaveLength(64);
    expect(JSON.stringify(evidence)).not.toContain("secret");
    expect(JSON.stringify(evidence)).not.toContain("rds.example.test");
  });

  it("rejects credential-only differences for the same database", () => {
    expect(() =>
      verifyDatabaseIsolation({
        productionUrl: "postgresql://one:a@rds.example.test/app",
        previewUrl: "postgresql://two:b@rds.example.test/app",
      }),
    ).toThrow("same database identity");
  });

  it("rejects local or malformed deployment values", () => {
    expect(() =>
      verifyDatabaseIsolation({
        productionUrl: "postgresql://localhost/app",
        previewUrl: "not-a-url",
      }),
    ).toThrow();
  });

  it("fingerprints observed identities without returning their components", () => {
    const observed = "10.0.1.4:5432/cornershop_preview";
    const fingerprint = fingerprintDatabaseIdentity(observed);

    expect(fingerprint).toHaveLength(64);
    expect(fingerprint).not.toContain("cornershop_preview");
  });
});
