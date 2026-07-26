import { describe, expect, it } from "bun:test";
import {
  configuredSuperadminEmails,
  isConfiguredSuperadminEmail,
} from "@/lib/superadmin-config";

describe("superadmin environment allowlist", () => {
  it("normalizes case, whitespace and duplicates", () => {
    expect(
      [...configuredSuperadminEmails(" Owner@Example.com,ops@example.com, owner@example.com ")],
    ).toEqual(["owner@example.com", "ops@example.com"]);
  });

  it("fails closed when the allowlist is absent", () => {
    expect(isConfiguredSuperadminEmail("owner@example.com", undefined)).toBe(
      false,
    );
  });

  it("matches normalized addresses only", () => {
    expect(
      isConfiguredSuperadminEmail(
        "OWNER@example.com",
        "owner@example.com,ops@example.com",
      ),
    ).toBe(true);
    expect(
      isConfiguredSuperadminEmail(
        "attacker@example.com",
        "owner@example.com,ops@example.com",
      ),
    ).toBe(false);
  });
});
