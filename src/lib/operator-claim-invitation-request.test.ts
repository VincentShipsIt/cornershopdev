import { describe, expect, it } from "bun:test";
import { operatorClaimInvitationRequestSchema } from "@/lib/operator-claim-invitation-request";

const baseRequest = {
  siteSlug: "chez-lea",
  email: "owner@chez-lea.test",
};

describe("operator claim invitation request", () => {
  it("requires a bounded ownership-evidence reference for direct approval", () => {
    expect(
      operatorClaimInvitationRequestSchema.safeParse(baseRequest).success,
    ).toBe(false);
    expect(
      operatorClaimInvitationRequestSchema.safeParse({
        ...baseRequest,
        approvalEvidenceRef: "crm:owner-consent-1234",
      }).success,
    ).toBe(true);
  });

  it("rejects reserved outreach references and requires a resend id", () => {
    expect(
      operatorClaimInvitationRequestSchema.safeParse({
        ...baseRequest,
        approvalEvidenceRef: "outreach-dispatch:forged",
      }).success,
    ).toBe(false);
    expect(
      operatorClaimInvitationRequestSchema.safeParse({
        ...baseRequest,
        action: "resend",
      }).success,
    ).toBe(false);
    expect(
      operatorClaimInvitationRequestSchema.safeParse({
        ...baseRequest,
        action: "resend",
        invitationId: "invite_1",
      }).success,
    ).toBe(true);
  });
});
