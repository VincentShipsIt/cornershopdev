import { describe, expect, it } from "bun:test";
import { normalizeAccountEmail } from "@/lib/account-email";

describe("account email identity", () => {
  it("normalizes the same way for sign-in and account creation", () => {
    expect(normalizeAccountEmail(" Owner@Example.COM ")).toBe(
      "owner@example.com",
    );
  });

  it("rejects malformed addresses", () => {
    expect(() => normalizeAccountEmail("not-an-email")).toThrow();
  });
});
