export const OUTREACH_CHANNEL_BASES = [
  "VERIFIED_WRITTEN_CONSENT",
  "VERIFIED_SOFT_OPT_IN",
] as const;

export const OUTREACH_CHANNEL = "EMAIL" as const;
export const OUTREACH_PURPOSE = "CLAIM_INVITATION_AND_FOLLOW_UP" as const;

export const REQUIRED_OUTREACH_EVIDENCE_KEYS = [
  "channel_basis",
  "recipient",
  "controller",
  "channel",
  "purpose",
  "evidence_timestamp",
  "evidence_source",
] as const;

export const REQUIRED_SOFT_OPT_IN_EVIDENCE_KEYS = [
  "customer_or_sale_evidence",
  "collection_opt_out_evidence",
] as const;

export type OutreachEligibilityReason =
  | "unknown"
  | "ineligible"
  | "channel_basis_required"
  | "evidence_required"
  | "recipient_mismatch";

export type ElectronicOutreachEligibilityDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: OutreachEligibilityReason;
      message: string;
    };

const evidenceReferencePattern =
  /^(?:crm|consent|ticket|dms):[A-Za-z0-9][A-Za-z0-9._:/#-]{3,155}$/i;

export function evaluateElectronicOutreachEligibility(input: {
  state: "UNKNOWN" | "ELIGIBLE" | "INELIGIBLE";
  evidence: Record<string, string>;
  expectedRecipient: string | null;
}): ElectronicOutreachEligibilityDecision {
  if (input.state === "UNKNOWN") {
    return {
      allowed: false,
      reason: "unknown",
      message:
        "Electronic outreach is blocked until a verified written-consent or soft-opt-in record is entered.",
    };
  }
  if (input.state === "INELIGIBLE") {
    return {
      allowed: false,
      reason: "ineligible",
      message: "This lead is explicitly ineligible for electronic outreach.",
    };
  }

  const basis = input.evidence.channel_basis;
  if (!OUTREACH_CHANNEL_BASES.some((candidate) => candidate === basis)) {
    return {
      allowed: false,
      reason: "channel_basis_required",
      message:
        "Electronic outreach requires VERIFIED_WRITTEN_CONSENT or VERIFIED_SOFT_OPT_IN evidence.",
    };
  }

  const requiredKeys = [
    ...REQUIRED_OUTREACH_EVIDENCE_KEYS,
    ...(basis === "VERIFIED_SOFT_OPT_IN"
      ? REQUIRED_SOFT_OPT_IN_EVIDENCE_KEYS
      : []),
  ];
  const missing = requiredKeys.filter((key) => !input.evidence[key]?.trim());
  if (missing.length > 0) {
    return {
      allowed: false,
      reason: "evidence_required",
      message: `Electronic outreach evidence must include ${missing.join(", ")}.`,
    };
  }

  if (
    !input.expectedRecipient ||
    normalizeEmail(input.evidence.recipient) !==
      normalizeEmail(input.expectedRecipient)
  ) {
    return {
      allowed: false,
      reason: "recipient_mismatch",
      message:
        "The recorded consent or soft-opt-in recipient does not match the private lead contact email.",
    };
  }

  const invalidFields: string[] = [];
  if (input.evidence.channel !== OUTREACH_CHANNEL) {
    invalidFields.push("channel=EMAIL");
  }
  if (input.evidence.purpose !== OUTREACH_PURPOSE) {
    invalidFields.push(`purpose=${OUTREACH_PURPOSE}`);
  }
  if (!isTimestampWithOffset(input.evidence.evidence_timestamp)) {
    invalidFields.push("evidence_timestamp");
  }
  if (!isSpecificController(input.evidence.controller)) {
    invalidFields.push("controller");
  }
  if (!isEvidenceReference(input.evidence.evidence_source)) {
    invalidFields.push("evidence_source");
  }
  if (
    basis === "VERIFIED_SOFT_OPT_IN" &&
    !isEvidenceReference(input.evidence.customer_or_sale_evidence)
  ) {
    invalidFields.push("customer_or_sale_evidence");
  }
  if (
    basis === "VERIFIED_SOFT_OPT_IN" &&
    !isEvidenceReference(input.evidence.collection_opt_out_evidence)
  ) {
    invalidFields.push("collection_opt_out_evidence");
  }
  if (invalidFields.length > 0) {
    return {
      allowed: false,
      reason: "evidence_required",
      message: `Electronic outreach evidence is invalid for ${invalidFields.join(", ")}. Use a private CRM, consent, ticket, or document reference; public-source evidence is not sufficient.`,
    };
  }

  return { allowed: true };
}

function normalizeEmail(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function isTimestampWithOffset(value: string | undefined): boolean {
  if (!value || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

function isEvidenceReference(value: string | undefined): boolean {
  return Boolean(value && evidenceReferencePattern.test(value));
}

function isSpecificController(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase() ?? "";
  return (
    normalized.length >= 3 &&
    !new Set([
      "company",
      "corporate",
      "generic corporate",
      "operator",
      "unknown",
      "n/a",
    ]).has(normalized)
  );
}
