import { describe, expect, it } from "bun:test";
import {
  compareOperatorSitesByDiscoveryScore,
  createLeadDiscoveryRecord,
  createLeadEligibilityRecord,
  evaluateLeadOutreachEligibility,
  mergeLeadEligibilityAttributes,
  mergeOperatorLeadAttributes,
  parseLeadEligibility,
  parseLeadDiscovery,
  resolveProspectIngestAction,
} from "@/lib/operator-lead-attributes";
import { auditLocalSeo } from "@/lib/local-seo-audit";

describe("operator lead attributes", () => {
  it("merges discovery and audit onto the existing attributes bag", () => {
    const discovery = createLeadDiscoveryRecord({
      city: "Lyon",
      placeId: "ChIJ123",
      sourceProvider: "google_places",
      score: 42,
      reasons: ["No menu link found on the homepage"],
      discoveredAt: "2026-08-19T10:00:00.000Z",
      websiteUrl: "https://chezmira.fr",
      rating: 4.2,
      reviewCount: 12,
      hasWebsite: true,
    });
    const audit = auditLocalSeo({
      name: "Chez Mira",
      address: null,
      phone: null,
      city: "Lyon",
      websiteUrl: "https://chezmira.fr",
      categories: ["restaurant"],
      hours: [],
      photoCount: 0,
      photoNewestAt: null,
      reviewCount: 12,
      description: null,
      homepage: null,
    });

    const merged = mergeOperatorLeadAttributes(
      { cuisine: "Lyonnais", showMenuImages: false },
      discovery,
      audit,
    );

    expect(merged.cuisine).toBe("Lyonnais");
    expect(parseLeadDiscovery(merged)?.score).toBe(42);
    expect(merged.localSeoAudit).toMatchObject({ score: audit.score });
    expect(parseLeadEligibility(merged)).toMatchObject({
      state: "UNKNOWN",
      evidence: {},
      updatedBy: "system:lead-discovery",
    });
  });

  it("reopens mutable leads and refuses claimed ones", () => {
    expect(resolveProspectIngestAction(null, "RESTAURANT")).toBe("create");
    expect(
      resolveProspectIngestAction(
        { status: "PROSPECT", vertical: "RESTAURANT" },
        "RESTAURANT",
      ),
    ).toBe("update");
    expect(
      resolveProspectIngestAction(
        { status: "CLAIMED", vertical: "RESTAURANT" },
        "RESTAURANT",
      ),
    ).toBe("conflict");
  });

  it("fails outreach closed until eligibility and contact evidence are explicit", () => {
    const unknown = mergeLeadEligibilityAttributes(
      {},
      createLeadEligibilityRecord({
        state: "UNKNOWN",
        evidence: {},
        updatedBy: "operator:one",
      }),
    );
    const ineligible = mergeLeadEligibilityAttributes(
      {},
      createLeadEligibilityRecord({
        state: "INELIGIBLE",
        evidence: {
          contact_basis: "Operator determined contact is not permitted",
          evidence_source: "Manual review",
        },
        updatedBy: "operator:one",
      }),
    );
    const discoveryOnly = mergeLeadEligibilityAttributes(
      {},
      createLeadEligibilityRecord({
        state: "ELIGIBLE",
        evidence: { public_source: "https://example.test/listing" },
        updatedBy: "operator:one",
      }),
    );

    expect(evaluateLeadOutreachEligibility(unknown)).toMatchObject({
      allowed: false,
      reason: "unknown",
    });
    expect(evaluateLeadOutreachEligibility(ineligible)).toMatchObject({
      allowed: false,
      reason: "ineligible",
    });
    expect(evaluateLeadOutreachEligibility(discoveryOnly)).toMatchObject({
      allowed: false,
      reason: "evidence_required",
    });
    expect(
      evaluateLeadOutreachEligibility(
        mergeLeadEligibilityAttributes(
          {},
          createLeadEligibilityRecord({
            state: "ELIGIBLE",
            evidence: {
              contact_basis: "Operator-recorded basis",
              evidence_source: "Consent record reviewed 2026-08-20",
            },
            updatedBy: "operator:one",
          }),
        ),
      ),
    ).toMatchObject({ allowed: true });
  });

  it("sorts scored sites worst-first and keeps unscored sites after them", () => {
    const newest = new Date("2026-08-19T12:00:00.000Z");
    const older = new Date("2026-08-18T12:00:00.000Z");
    const rows = [
      { createdAt: newest, discovery: null },
      { createdAt: older, discovery: { score: 80 } },
      { createdAt: newest, discovery: { score: 20 } },
    ];

    expect(
      [...rows].sort(compareOperatorSitesByDiscoveryScore).map((row) => row.discovery?.score ?? null),
    ).toEqual([20, 80, null]);
  });
});
