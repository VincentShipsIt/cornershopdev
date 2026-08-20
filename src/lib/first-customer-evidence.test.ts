import { describe, expect, it } from "bun:test";
import { generateKeyPairSync, sign } from "node:crypto";
import {
  digestFirstCustomerEvidence,
  evaluateFirstCustomerEvidence,
  firstCustomerEvidenceAttestationDigest,
  FIRST_CUSTOMER_AUTOMATED_CHECKS,
  FIRST_CUSTOMER_REAL_CHECKS,
  firstCustomerProductionManifestSchema,
  fingerprintFirstCustomerIdentifier,
  isHumanAcceptanceWindowComplete,
  isCustomerDomainHostname,
  verifyFirstCustomerEvidenceAttestation,
} from "@/lib/first-customer-evidence";

function passingChecks<T extends readonly string[]>(checks: T) {
  return Object.fromEntries(checks.map((check) => [check, true])) as Record<
    T[number],
    boolean
  >;
}

describe("first-customer evidence verdict", () => {
  it("reports deterministic test evidence as automated only", () => {
    const result = evaluateFirstCustomerEvidence({
      environment: "test",
      automated: passingChecks(FIRST_CUSTOMER_AUTOMATED_CHECKS),
      real: passingChecks(FIRST_CUSTOMER_REAL_CHECKS),
    });

    expect(result.outcome).toBe("AUTOMATED_PATH_VERIFIED");
    expect(result.automatedPathVerified).toBe(true);
    expect(result.realCustomerAcceptanceVerified).toBe(false);
  });

  it("requires every automated and real production gate", () => {
    const result = evaluateFirstCustomerEvidence({
      environment: "production",
      automated: passingChecks(FIRST_CUSTOMER_AUTOMATED_CHECKS),
      real: passingChecks(FIRST_CUSTOMER_REAL_CHECKS),
    });

    expect(result.outcome).toBe("REAL_CUSTOMER_ACCEPTANCE_VERIFIED");
    expect(result.missing).toEqual([]);
  });

  it("fails closed instead of upgrading incomplete production evidence", () => {
    const real = passingChecks(FIRST_CUSTOMER_REAL_CHECKS);
    real.settled_live_payment = false;
    real.provider_delivered_claim = false;

    const result = evaluateFirstCustomerEvidence({
      environment: "production",
      automated: passingChecks(FIRST_CUSTOMER_AUTOMATED_CHECKS),
      real,
    });

    expect(result.outcome).toBe("AUTOMATED_PATH_VERIFIED");
    expect(result.realCustomerAcceptanceVerified).toBe(false);
    expect(result.missing).toEqual([
      "settled_live_payment",
      "provider_delivered_claim",
    ]);
  });

  it("reports NOT_VERIFIED when the deterministic path is incomplete", () => {
    const automated = passingChecks(FIRST_CUSTOMER_AUTOMATED_CHECKS);
    automated.atomic_publish = false;

    const result = evaluateFirstCustomerEvidence({
      environment: "production",
      automated,
      real: passingChecks(FIRST_CUSTOMER_REAL_CHECKS),
    });

    expect(result.outcome).toBe("NOT_VERIFIED");
    expect(result.missing).toContain("atomic_publish");
  });
});

describe("production evidence manifest", () => {
  const valid = {
    schemaVersion: 1,
    environment: "production",
    siteSlug: "le-petit-meunier",
    publicUrl: "https://restaurant.example/",
    ownerAuthorization: {
      evidenceRef: "private-crm://owner-authorization/record-1",
      authorizedAt: "2026-08-20T10:00:00.000Z",
    },
    stripe: {
      checkoutSessionId: "cs_live_example",
      webhookEventId: "evt_example",
      subscriptionId: "sub_example",
    },
    delivery: {
      claimInvitationId: "claim_1",
      claimProviderDeliveryEventId: "event_claim_delivery",
      claimReplayRejectionAuditId: "audit_claim_replay",
      authMagicLinkId: "magic_1",
      authProviderDeliveryEventId: "event_auth_delivery",
    },
    session: {
      sessionId: "session_1",
      siteId: "site_1",
      bindingAuditId: "audit_session_binding",
      revocationAuditId: "audit_session_revocation",
    },
    publication: {
      sourceImportAuditId: "audit_import",
      draftSaveAuditId: "audit_save",
      publishAuditId: "audit_publish",
      publishedVersionId: "version_2",
    },
    alerts: {
      checkout: {
        alertId: "alert_checkout",
        receiptRef: "private-ops://alert-receipt/checkout",
      },
      publish: {
        alertId: "alert_publish",
        receiptRef: "private-ops://alert-receipt/publish",
      },
      publicSite: {
        alertId: "alert_public",
        receiptRef: "private-ops://alert-receipt/public-site",
      },
    },
    humanEvidence: {
      ownerEditConfirmationRef: "private-crm://owner-edit/record-1",
      ownerEditConfirmedAt: "2026-08-20T10:30:00.000Z",
      onboardingCostRef: "private-crm://onboarding-cost/record-1",
      onboardingRecordedAt: "2026-08-20T12:00:00.000Z",
      supportCostRef: "private-crm://support-cost/record-1",
      supportWindowEndedAt: "2026-09-19T12:00:00.000Z",
      thirtyDayReviewRef: "private-calendar://review/record-1",
      thirtyDayReviewScheduledAt: "2026-08-20T12:00:00.000Z",
      thirtyDayReviewCompletedAt: "2026-09-19T12:00:00.000Z",
    },
    attestation: {
      algorithm: "ed25519",
      signerId: "private-evidence-custodian:vincent",
      signedAt: "2026-09-19T12:01:00.000Z",
      signature:
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
    },
  } as const;

  it("accepts complete references without requiring private contents", () => {
    expect(firstCustomerProductionManifestSchema.parse(valid)).toEqual(valid);
  });

  it("rejects placeholders and non-HTTPS production URLs", () => {
    expect(() =>
      firstCustomerProductionManifestSchema.parse({
        ...valid,
        publicUrl: "http://restaurant.example/",
        ownerAuthorization: { ...valid.ownerAuthorization, evidenceRef: "TBD" },
      }),
    ).toThrow();
  });

  it("rejects factory, niche, subdomain, and configured platform hosts", () => {
    for (const publicUrl of [
      "https://cornershop.dev/le-petit-meunier",
      "https://preview.cornershop.dev/le-petit-meunier",
      "https://restofront.com/le-petit-meunier",
      "https://le-petit-meunier.restofront.com/",
    ]) {
      expect(() =>
        firstCustomerProductionManifestSchema.parse({ ...valid, publicUrl }),
      ).toThrow();
    }
    expect(
      isCustomerDomainHostname("sites.internal.example", [
        "sites.internal.example",
      ]),
    ).toBe(false);
    expect(isCustomerDomainHostname("restaurant.example")).toBe(true);
  });

  it("requires an offline signature over every private evidence reference", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const signature = sign(
      null,
      Buffer.from(firstCustomerEvidenceAttestationDigest(valid), "hex"),
      privateKey,
    ).toString("base64");
    const manifest = {
      ...valid,
      attestation: { ...valid.attestation, signature },
    };
    const publicKeyDer = Buffer.from(
      publicKey.export({ format: "der", type: "spki" }),
    ).toString("base64");

    expect(
      verifyFirstCustomerEvidenceAttestation(
        manifest,
        publicKeyDer,
        new Date("2026-09-19T12:02:00.000Z"),
      ),
    ).toBe(true);
    expect(
      verifyFirstCustomerEvidenceAttestation(
        {
          ...manifest,
          humanEvidence: {
            ...manifest.humanEvidence,
            supportCostRef: "private-crm://support-cost/invented-record",
          },
        },
        publicKeyDer,
        new Date("2026-09-19T12:02:00.000Z"),
      ),
    ).toBe(false);
    expect(
      verifyFirstCustomerEvidenceAttestation(
        {
          ...manifest,
          attestation: {
            ...manifest.attestation,
            signedAt: "2026-09-19T12:01:30.000Z",
          },
        },
        publicKeyDer,
        new Date("2026-09-19T12:02:00.000Z"),
      ),
    ).toBe(false);
  });

  it("rejects signatures made before the evidence set was complete", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const early = {
      ...valid,
      attestation: {
        ...valid.attestation,
        signedAt: "2026-08-20T12:01:00.000Z",
      },
    };
    const manifest = {
      ...early,
      attestation: {
        ...early.attestation,
        signature: sign(
          null,
          Buffer.from(firstCustomerEvidenceAttestationDigest(early), "hex"),
          privateKey,
        ).toString("base64"),
      },
    };

    expect(
      verifyFirstCustomerEvidenceAttestation(
        manifest,
        Buffer.from(
          publicKey.export({ format: "der", type: "spki" }),
        ).toString("base64"),
        new Date("2026-09-19T12:02:00.000Z"),
      ),
    ).toBe(false);
  });
});

describe("redacted evidence helpers", () => {
  it("digests object keys deterministically", () => {
    expect(digestFirstCustomerEvidence({ b: 2, a: 1 })).toBe(
      digestFirstCustomerEvidence({ a: 1, b: 2 }),
    );
  });

  it("fingerprints identifiers without returning them", () => {
    const identifier = "cs_live_private_customer_identifier";
    const fingerprint = fingerprintFirstCustomerIdentifier(identifier);

    expect(fingerprint).toHaveLength(16);
    expect(fingerprint).not.toContain(identifier);
  });
});

describe("human acceptance window", () => {
  const checkoutCreatedAt = new Date("2026-08-20T10:00:00.000Z");
  const invoiceSettledAt = new Date("2026-08-20T10:05:00.000Z");
  const draftSavedAt = new Date("2026-08-20T11:00:00.000Z");
  const complete = {
    checkoutCreatedAt,
    invoiceSettledAt,
    draftSavedAt,
    ownerEditConfirmedAt: new Date("2026-08-20T10:30:00.000Z"),
    onboardingRecordedAt: new Date("2026-08-20T12:00:00.000Z"),
    supportWindowEndedAt: new Date("2026-09-19T10:05:00.000Z"),
    thirtyDayReviewScheduledAt: new Date("2026-08-20T12:00:00.000Z"),
    thirtyDayReviewCompletedAt: new Date("2026-09-19T10:05:00.000Z"),
    now: new Date("2026-09-19T10:06:00.000Z"),
  };

  it("accepts human records only after the settled invoice matures", () => {
    expect(isHumanAcceptanceWindowComplete(complete)).toBe(true);
  });

  it("cannot report 30-day acceptance early despite valid-looking refs", () => {
    expect(
      isHumanAcceptanceWindowComplete({
        ...complete,
        now: new Date("2026-09-19T10:04:59.000Z"),
      }),
    ).toBe(false);
  });

  it("rejects records that do not belong to this checkout timeline", () => {
    expect(
      isHumanAcceptanceWindowComplete({
        ...complete,
        ownerEditConfirmedAt: new Date("2026-08-19T10:30:00.000Z"),
      }),
    ).toBe(false);
    expect(
      isHumanAcceptanceWindowComplete({
        ...complete,
        thirtyDayReviewScheduledAt: new Date("2026-08-22T10:05:00.000Z"),
      }),
    ).toBe(false);
  });
});
