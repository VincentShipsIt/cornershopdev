import { z } from "zod";
import { CLAIM_APPROVAL_EVIDENCE_REF_MAX_LENGTH } from "@/lib/claim-invitations";

export const operatorClaimInvitationRequestSchema = z
  .object({
    siteSlug: z.string().trim().min(2).max(80),
    email: z.email().max(320),
    action: z.enum(["issue", "resend"]).default("issue"),
    invitationId: z.string().trim().min(1).max(100).optional(),
    approvalEvidenceRef: z
      .string()
      .trim()
      .min(8)
      .max(CLAIM_APPROVAL_EVIDENCE_REF_MAX_LENGTH)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:/#-]+$/)
      .refine((value) => !value.startsWith("outreach-dispatch:"), {
        message: "Use the CRM, ticket, or consent-record reference.",
      })
      .optional(),
  })
  .superRefine((input, context) => {
    if (input.action === "issue" && !input.approvalEvidenceRef) {
      context.addIssue({
        code: "custom",
        path: ["approvalEvidenceRef"],
        message: "Record the ownership approval evidence reference.",
      });
    }
    if (input.action === "resend" && !input.invitationId) {
      context.addIssue({
        code: "custom",
        path: ["invitationId"],
        message: "Select the invitation to resend.",
      });
    }
  });
