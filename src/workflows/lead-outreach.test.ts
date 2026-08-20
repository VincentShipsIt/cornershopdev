import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const {
  isLeadEligibleForOutreach,
  isReviewedLead,
  unknownOutreachStepResult,
} = await import("@/workflows/lead-outreach");

describe("Workflow delivery result boundary", () => {
  it("turns ambiguous provider acceptance into data before Workflow can rewrite the error", () => {
    const error = new Error("Provider acceptance is unknown.");
    error.name = "OutreachDeliveryUnknownError";

    expect(unknownOutreachStepResult(error)).toEqual({
      status: "unknown",
      message: "Provider acceptance is unknown.",
    });
    expect(unknownOutreachStepResult(new Error("definite failure"))).toBeNull();
  });
});

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

  it("allows follow-up only after a sent or delivered initial message", () => {
    const site = { status: "PREVIEW_READY", email: "owner@example.com" };
    expect(isLeadEligibleForOutreach(site, false, "SENT")).toBe(true);
    expect(isLeadEligibleForOutreach(site, false, "DELIVERED")).toBe(true);
    expect(isLeadEligibleForOutreach(site, false, "QUEUED")).toBe(false);
    expect(isLeadEligibleForOutreach(site, false, "FAILED")).toBe(false);
  });

  it("suppresses follow-up after a bounce or complaint", () => {
    const site = { status: "PREVIEW_READY", email: "owner@example.com" };
    expect(isLeadEligibleForOutreach(site, false, "BOUNCED")).toBe(false);
    expect(isLeadEligibleForOutreach(site, false, "COMPLAINED")).toBe(false);
  });

  it("suppresses further campaign sends after an inbound reply", () => {
    const site = { status: "PREVIEW_READY", email: "owner@example.com" };
    expect(isLeadEligibleForOutreach(site, false, "DELIVERED", true)).toBe(
      false,
    );
  });
});

describe("reviewed niche delivery eligibility", () => {
  const reviewedAt = "2026-08-19T08:01:00.000Z";
  const site = {
    status: "PREVIEW_READY",
    email: "owner@example.com",
    vertical: "RESTAURANT",
    updatedAt: new Date("2026-08-19T08:00:00.000Z"),
    auditEvents: [
      { createdAt: new Date("2026-08-19T08:01:00.000Z") },
    ],
  };

  it("binds delivery to the current reviewed restaurant and recipient", () => {
    expect(
      isReviewedLead(
        site,
        false,
        "owner@example.com",
        reviewedAt,
      ),
    ).toBe(true);
    expect(
      isReviewedLead(
        { ...site, email: "changed@example.com" },
        false,
        "owner@example.com",
        reviewedAt,
      ),
    ).toBe(false);
    expect(
      isReviewedLead(
        { ...site, vertical: "BEAUTY" },
        false,
        "owner@example.com",
        reviewedAt,
      ),
    ).toBe(false);
  });

  it("stops after a pause, edit, or replacement review not confirmed for this dispatch", () => {
    expect(
      isReviewedLead(
        site,
        true,
        "owner@example.com",
        reviewedAt,
      ),
    ).toBe(false);
    expect(
      isReviewedLead(
        {
          ...site,
          updatedAt: new Date("2026-08-19T08:02:00.000Z"),
        },
        false,
        "owner@example.com",
        reviewedAt,
      ),
    ).toBe(false);
    expect(
      isReviewedLead(
        {
          ...site,
          updatedAt: new Date("2026-08-19T08:02:00.000Z"),
          auditEvents: [
            { createdAt: new Date("2026-08-19T08:03:00.000Z") },
          ],
        },
        false,
        "owner@example.com",
        reviewedAt,
      ),
    ).toBe(false);
  });
});
