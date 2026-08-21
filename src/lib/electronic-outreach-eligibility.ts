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
  | "recipient_mismatch"
  | "controller_mismatch";

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
  expectedController: string | null;
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

  if (
    !input.expectedController ||
    normalizeController(input.evidence.controller) !==
      normalizeController(input.expectedController)
  ) {
    return {
      allowed: false,
      reason: "controller_mismatch",
      message:
        "The recorded consent or soft-opt-in controller does not match the configured legal sender controller.",
    };
  }

  const invalidFields: string[] = [];
  if (input.evidence.channel !== OUTREACH_CHANNEL) {
    invalidFields.push("channel=EMAIL");
  }
  if (input.evidence.purpose !== OUTREACH_PURPOSE) {
    invalidFields.push(`purpose=${OUTREACH_PURPOSE}`);
  }
  if (!isPastOrPresentTimestampWithOffset(input.evidence.evidence_timestamp)) {
    invalidFields.push("evidence_timestamp");
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

function normalizeController(value: string | undefined): string {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}

function isPastOrPresentTimestampWithOffset(
  value: string | undefined,
): boolean {
  if (!value || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

function isEvidenceReference(value: string | undefined): boolean {
  return Boolean(value && evidenceReferencePattern.test(value));
}

export function configuredOutreachController(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const controller = env.OUTREACH_LEGAL_CONTROLLER?.trim().replace(/\s+/g, " ");
  if (
    !controller ||
    controller.length < 3 ||
    new Set([
      "company",
      "corporate",
      "generic corporate",
      "operator",
      "unknown",
      "n/a",
    ]).has(controller.toLowerCase())
  ) {
    return null;
  }
  return controller;
}
