import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const { isLeadEligibleForOutreach } = await import(
  "@/workflows/lead-outreach"
);

describe("isLeadEligibleForOutreach", () => {
  it("is eligible for a fresh prospect with a contact email", () => {
    expect(
      isLeadEligibleForOutreach(
        { status: "PROSPECT", email: "owner@example.com" },
        false,
      ),
    ).toBe(true);
  });

  it("is eligible for a lead already sent a preview", () => {
    expect(
      isLeadEligibleForOutreach(
        { status: "PREVIEW_READY", email: "owner@example.com" },
        false,
      ),
    ).toBe(true);
  });

  it("is not eligible once the site is claimed", () => {
    expect(
      isLeadEligibleForOutreach(
        { status: "CLAIMED", email: "owner@example.com" },
        false,
      ),
    ).toBe(false);
  });

  it("is not eligible once the site is live", () => {
    expect(
      isLeadEligibleForOutreach(
        { status: "LIVE", email: "owner@example.com" },
        false,
      ),
    ).toBe(false);
  });

  it("is not eligible without a contact email on file", () => {
    expect(
      isLeadEligibleForOutreach({ status: "PROSPECT", email: null }, false),
    ).toBe(false);
  });

  it("is not eligible when the site cannot be found", () => {
    expect(isLeadEligibleForOutreach(null, false)).toBe(false);
  });

  it("is not eligible while outreach is paused, even for an otherwise-eligible lead", () => {
    expect(
      isLeadEligibleForOutreach(
        { status: "PROSPECT", email: "owner@example.com" },
        true,
      ),
    ).toBe(false);
  });
});
