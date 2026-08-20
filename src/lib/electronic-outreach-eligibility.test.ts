import { describe, expect, it } from "bun:test";
import {
  evaluateElectronicOutreachEligibility,
  OUTREACH_PURPOSE,
} from "@/lib/electronic-outreach-eligibility";

const commonEvidence = {
  recipient: "owner@example.test",
  controller: "Corner Shop Labs Ltd",
  channel: "EMAIL",
  purpose: OUTREACH_PURPOSE,
  evidence_timestamp: "2026-08-20T09:00:00+02:00",
  evidence_source: "consent:owner-record-1234",
};

describe("electronic outreach eligibility", () => {
  it("accepts written consent bound to the exact private recipient", () => {
    expect(
      evaluateElectronicOutreachEligibility({
        state: "ELIGIBLE",
        evidence: {
          ...commonEvidence,
          channel_basis: "VERIFIED_WRITTEN_CONSENT",
        },
        expectedRecipient: "Owner@Example.Test",
      }),
    ).toEqual({ allowed: true });
  });

  it("accepts soft opt-in only with customer or sale and collection opt-out proof", () => {
    const evidence = {
      ...commonEvidence,
      channel_basis: "VERIFIED_SOFT_OPT_IN",
      evidence_source: "crm:soft-opt-in-1234",
      customer_or_sale_evidence: "crm:sale-1234",
      collection_opt_out_evidence: "crm:collection-opt-out-1234",
    };
    expect(
      evaluateElectronicOutreachEligibility({
        state: "ELIGIBLE",
        evidence: evidence as Record<string, string>,
        expectedRecipient: "owner@example.test",
      }),
    ).toEqual({ allowed: true });

    expect(
      evaluateElectronicOutreachEligibility({
        state: "ELIGIBLE",
        evidence: { ...evidence, collection_opt_out_evidence: "" },
        expectedRecipient: "owner@example.test",
      }),
    ).toMatchObject({ allowed: false, reason: "evidence_required" });
  });

  it.each([
    {
      label: "a generic eligible flag",
      evidence: { contact_basis: "generic corporate" },
      reason: "channel_basis_required",
    },
    {
      label: "a public listing",
      evidence: {
        ...commonEvidence,
        channel_basis: "VERIFIED_WRITTEN_CONSENT",
        evidence_source: "https://directory.example.test/owner",
      },
      reason: "evidence_required",
    },
    {
      label: "a value-first rationale",
      evidence: { contact_basis: "value-first outreach" },
      reason: "channel_basis_required",
    },
    {
      label: "a different recipient",
      evidence: {
        ...commonEvidence,
        channel_basis: "VERIFIED_WRITTEN_CONSENT",
        recipient: "someone-else@example.test",
      },
      reason: "recipient_mismatch",
    },
  ])("blocks $label", ({ evidence, reason }) => {
    expect(
      evaluateElectronicOutreachEligibility({
        state: "ELIGIBLE",
        evidence: evidence as unknown as Record<string, string>,
        expectedRecipient: "owner@example.test",
      }),
    ).toMatchObject({ allowed: false, reason });
  });
});
