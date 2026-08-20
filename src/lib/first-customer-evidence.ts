import { createHash, createPublicKey, verify } from "node:crypto";
import { z } from "zod";
import { evidenceDigest } from "@/lib/evidence-digests";

export const firstCustomerOutcomeSchema = z.enum([
  "NOT_VERIFIED",
  "AUTOMATED_PATH_VERIFIED",
  "REAL_CUSTOMER_ACCEPTANCE_VERIFIED",
]);

export type FirstCustomerOutcome = z.infer<
  typeof firstCustomerOutcomeSchema
>;

const evidenceReferenceSchema = z
  .string()
  .trim()
  .min(8)
  .max(500)
  .refine(
    (value) =>
      !/(pending|todo|tbd|none|null|n\/a|placeholder|redacted|replace)/i.test(
        value,
      ),
    "Use a durable evidence reference, not a placeholder.",
  )
  .refine(
    (value) => {
      try {
        const protocol = new URL(value).protocol;
        return [
          "https:",
          "private-crm:",
          "private-ops:",
          "private-calendar:",
        ].includes(protocol);
      } catch {
        return false;
      }
    },
    "Use an HTTPS or approved private evidence reference.",
  );

const stripeIdSchema = (prefix: string) =>
  z.string().trim().regex(new RegExp(`^${prefix}_[A-Za-z0-9_]+$`));

const FACTORY_AND_NICHE_DOMAIN_SUFFIXES = [
  "cornershop.dev",
  "restofront.com",
] as const;

export function isCustomerDomainHostname(
  value: string,
  configuredPlatformHostnames: readonly string[] = [],
): boolean {
  const hostname = value.trim().toLowerCase().replace(/\.$/, "");
  if (!hostname) return false;
  return ![
    ...FACTORY_AND_NICHE_DOMAIN_SUFFIXES,
    ...configuredPlatformHostnames,
  ]
    .map((candidate) => candidate.trim().toLowerCase().replace(/\.$/, ""))
    .filter(Boolean)
    .some(
      (candidate) =>
        hostname === candidate || hostname.endsWith(`.${candidate}`),
    );
}

export const firstCustomerProductionEvidenceSchema = z.object({
  schemaVersion: z.literal(1),
  environment: z.literal("production"),
  siteSlug: z.string().trim().min(2).max(80),
  publicUrl: z
    .url()
    .refine((value) => new URL(value).protocol === "https:", {
      message: "The production customer URL must use HTTPS.",
    })
    .refine((value) => isCustomerDomainHostname(new URL(value).hostname), {
      message: "A factory or niche hostname cannot prove a customer domain.",
    }),
  ownerAuthorization: z.object({
    evidenceRef: evidenceReferenceSchema,
    authorizedAt: z.iso.datetime({ offset: true }),
  }),
  stripe: z.object({
    checkoutSessionId: stripeIdSchema("cs"),
    webhookEventId: stripeIdSchema("evt"),
    subscriptionId: stripeIdSchema("sub"),
  }),
  delivery: z.object({
    claimInvitationId: z.string().trim().min(1).max(128),
    claimProviderDeliveryEventId: z.string().trim().min(1).max(128),
    claimReplayRejectionAuditId: z.string().trim().min(1).max(128),
    authMagicLinkId: z.string().trim().min(1).max(128),
    authProviderDeliveryEventId: z.string().trim().min(1).max(128),
  }),
  session: z.object({
    sessionId: z.string().trim().min(1).max(128),
    siteId: z.string().trim().min(1).max(128),
    bindingAuditId: z.string().trim().min(1).max(128),
    revocationAuditId: z.string().trim().min(1).max(128),
  }),
  publication: z.object({
    sourceImportAuditId: z.string().trim().min(1).max(128),
    draftSaveAuditId: z.string().trim().min(1).max(128),
    publishAuditId: z.string().trim().min(1).max(128),
    publishedVersionId: z.string().trim().min(1).max(128),
  }),
  alerts: z.object({
    checkout: z.object({
      alertId: z.string().trim().min(1).max(128),
      receiptRef: evidenceReferenceSchema,
    }),
    publish: z.object({
      alertId: z.string().trim().min(1).max(128),
      receiptRef: evidenceReferenceSchema,
    }),
    publicSite: z.object({
      alertId: z.string().trim().min(1).max(128),
      receiptRef: evidenceReferenceSchema,
    }),
  }),
  humanEvidence: z.object({
    ownerEditConfirmationRef: evidenceReferenceSchema,
    ownerEditConfirmedAt: z.iso.datetime({ offset: true }),
    onboardingCostRef: evidenceReferenceSchema,
    onboardingRecordedAt: z.iso.datetime({ offset: true }),
    supportCostRef: evidenceReferenceSchema,
    supportWindowEndedAt: z.iso.datetime({ offset: true }),
    thirtyDayReviewRef: evidenceReferenceSchema,
    thirtyDayReviewScheduledAt: z.iso.datetime({ offset: true }),
    thirtyDayReviewCompletedAt: z.iso.datetime({ offset: true }),
  }),
});

export const firstCustomerProductionManifestSchema =
  firstCustomerProductionEvidenceSchema.extend({
    attestation: z.object({
      algorithm: z.literal("ed25519"),
      signerId: z
        .string()
        .trim()
        .min(3)
        .max(120)
        .regex(/^[A-Za-z0-9][A-Za-z0-9._:@/-]+$/),
      signedAt: z.iso.datetime({ offset: true }),
      signature: z.string().trim().regex(/^[A-Za-z0-9+/]{80,}={0,2}$/),
    }),
  });

export type FirstCustomerProductionManifest = z.infer<
  typeof firstCustomerProductionManifestSchema
>;

/**
 * Digest signed by the private evidence custodian after reviewing every opaque
 * record. The attestation itself is excluded so signatures are reproducible.
 */
export function firstCustomerEvidenceAttestationDigest(
  manifest: FirstCustomerProductionManifest,
): string {
  return evidenceDigest({
    ...firstCustomerProductionEvidenceSchema.parse(manifest),
    attestation: {
      algorithm: manifest.attestation.algorithm,
      signerId: manifest.attestation.signerId,
      signedAt: manifest.attestation.signedAt,
    },
  });
}

/** Verify an offline Ed25519 signature without exposing private evidence. */
export function verifyFirstCustomerEvidenceAttestation(
  manifest: FirstCustomerProductionManifest,
  publicKeyDerBase64: string,
  now = new Date(),
): boolean {
  try {
    const signedAt = new Date(manifest.attestation.signedAt);
    const latestEvidenceAt = Math.max(
      new Date(manifest.ownerAuthorization.authorizedAt).getTime(),
      new Date(manifest.humanEvidence.ownerEditConfirmedAt).getTime(),
      new Date(manifest.humanEvidence.onboardingRecordedAt).getTime(),
      new Date(manifest.humanEvidence.supportWindowEndedAt).getTime(),
      new Date(manifest.humanEvidence.thirtyDayReviewScheduledAt).getTime(),
      new Date(manifest.humanEvidence.thirtyDayReviewCompletedAt).getTime(),
    );
    if (
      !Number.isFinite(signedAt.getTime()) ||
      signedAt.getTime() < latestEvidenceAt ||
      signedAt > now
    ) {
      return false;
    }
    const publicKey = createPublicKey({
      key: Buffer.from(publicKeyDerBase64, "base64"),
      format: "der",
      type: "spki",
    });
    return verify(
      null,
      Buffer.from(firstCustomerEvidenceAttestationDigest(manifest), "hex"),
      publicKey,
      Buffer.from(manifest.attestation.signature, "base64"),
    );
  } catch {
    return false;
  }
}

export const FIRST_CUSTOMER_AUTOMATED_CHECKS = [
  "single_use_claim",
  "webhook_only_provisioning",
  "workspace_binding",
  "private_draft_save",
  "atomic_publish",
  "live_version_identity",
  "integration_preservation",
  "failure_alerting",
] as const;

export const FIRST_CUSTOMER_REAL_CHECKS = [
  "production_environment",
  "owner_authorization",
  "live_stripe_price",
  "settled_live_payment",
  "persisted_webhook_provisioning",
  "provider_delivered_claim",
  "provider_delivered_auth",
  "session_site_binding",
  "private_draft_save_evidence",
  "atomic_publish_evidence",
  "verified_tls_and_live_version",
  "preserved_integrations",
  "delivered_alert_receipts",
  "human_cost_and_review_records",
] as const;

export type FirstCustomerAutomatedCheck =
  (typeof FIRST_CUSTOMER_AUTOMATED_CHECKS)[number];
export type FirstCustomerRealCheck =
  (typeof FIRST_CUSTOMER_REAL_CHECKS)[number];

export type FirstCustomerEvidenceInput = {
  environment: "test" | "production";
  automated: Record<FirstCustomerAutomatedCheck, boolean>;
  real: Record<FirstCustomerRealCheck, boolean>;
};

export type FirstCustomerEvidenceCheck = {
  check: FirstCustomerAutomatedCheck | FirstCustomerRealCheck;
  passed: boolean;
};

export type FirstCustomerEvidenceResult = {
  outcome: FirstCustomerOutcome;
  automatedPathVerified: boolean;
  realCustomerAcceptanceVerified: boolean;
  checks: FirstCustomerEvidenceCheck[];
  missing: Array<FirstCustomerAutomatedCheck | FirstCustomerRealCheck>;
};

export type FirstCustomerHumanAcceptanceTimeline = {
  checkoutCreatedAt: Date;
  invoiceSettledAt: Date;
  draftSavedAt: Date;
  ownerEditConfirmedAt: Date;
  onboardingRecordedAt: Date;
  supportWindowEndedAt: Date;
  thirtyDayReviewScheduledAt: Date;
  thirtyDayReviewCompletedAt: Date;
  now: Date;
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1_000;
const ONE_DAY_MS = 24 * 60 * 60 * 1_000;

/**
 * A review reference cannot prove 30-day acceptance before 30 days have
 * elapsed. Timestamps also bind each opaque private record to this checkout's
 * real customer timeline instead of accepting a reusable reference alone.
 */
export function isHumanAcceptanceWindowComplete(
  input: FirstCustomerHumanAcceptanceTimeline,
): boolean {
  const maturity = new Date(input.invoiceSettledAt.getTime() + THIRTY_DAYS_MS);
  const reviewSchedulingDeadline = new Date(
    input.invoiceSettledAt.getTime() + ONE_DAY_MS,
  );

  return (
    input.now >= maturity &&
    input.ownerEditConfirmedAt >= input.checkoutCreatedAt &&
    input.ownerEditConfirmedAt <= input.draftSavedAt &&
    input.onboardingRecordedAt >= input.checkoutCreatedAt &&
    input.onboardingRecordedAt <= input.now &&
    input.thirtyDayReviewScheduledAt >= input.checkoutCreatedAt &&
    input.thirtyDayReviewScheduledAt <= reviewSchedulingDeadline &&
    input.supportWindowEndedAt >= maturity &&
    input.supportWindowEndedAt <= input.now &&
    input.thirtyDayReviewCompletedAt >= maturity &&
    input.thirtyDayReviewCompletedAt <= input.now
  );
}

/**
 * Produces an intentionally asymmetric verdict. Test evidence can prove the
 * deterministic platform path, but it can never be promoted into real customer
 * acceptance. Production acceptance additionally requires every provider,
 * customer, public-domain and human evidence gate.
 */
export function evaluateFirstCustomerEvidence(
  input: FirstCustomerEvidenceInput,
): FirstCustomerEvidenceResult {
  const automatedChecks = FIRST_CUSTOMER_AUTOMATED_CHECKS.map((check) => ({
    check,
    passed: input.automated[check] === true,
  }));
  const realChecks = FIRST_CUSTOMER_REAL_CHECKS.map((check) => ({
    check,
    passed: input.real[check] === true,
  }));
  const automatedPathVerified = automatedChecks.every(({ passed }) => passed);
  const realCustomerAcceptanceVerified =
    input.environment === "production" &&
    automatedPathVerified &&
    realChecks.every(({ passed }) => passed);
  const checks = [...automatedChecks, ...realChecks];

  return {
    outcome: realCustomerAcceptanceVerified
      ? "REAL_CUSTOMER_ACCEPTANCE_VERIFIED"
      : automatedPathVerified
        ? "AUTOMATED_PATH_VERIFIED"
        : "NOT_VERIFIED",
    automatedPathVerified,
    realCustomerAcceptanceVerified,
    checks,
    missing: checks.filter(({ passed }) => !passed).map(({ check }) => check),
  };
}

/** Stable digest for redacted content and integration comparisons. */
export function digestFirstCustomerEvidence(value: unknown): string {
  return evidenceDigest(value);
}

/**
 * Opaque identifiers are safe to attach to an issue while still allowing two
 * runs to demonstrate that they observed the same underlying record.
 */
export function fingerprintFirstCustomerIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}
