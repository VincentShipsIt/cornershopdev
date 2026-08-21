import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

const enabled = process.env.OPERATOR_LEAD_INGEST_POSTGRES_TEST === "1";
if (enabled) mock.module("server-only", () => ({}));

const suffix = randomUUID();
const safeSuffix = suffix.replaceAll("-", "");
const originalSource = `https://old-${suffix}.example.test/catalog`;
const finalSource = `https://new-${suffix}.example.test/shop`;
const failedOriginalSource = `https://failed-old-${suffix}.example.test/menu`;
const failedFinalSource = `https://failed-new-${suffix}.example.test/restaurant`;
const successfulSlug = `redirected-lead-${suffix}`;
const failedSlug = `failed-redirected-lead-${suffix}`;
const failurePlaceId = `forced-ingest-failure-${suffix}`;
const triggerName = `lead_ingest_failure_trigger_${safeSuffix}`;
const triggerFunction = `lead_ingest_failure_function_${safeSuffix}`;

let db: ReturnType<typeof import("@/lib/db").getDb>;
let createImportJob: typeof import("@/lib/site-persistence").createImportJob;
let persistSiteImport: typeof import("@/lib/site-persistence").persistSiteImport;
let recordImportFailure: typeof import("@/lib/site-persistence").recordImportFailure;
let sampleSiteDraft: typeof import("@/lib/restaurant").sampleSiteDraft;
let createLeadDiscoveryRecord: typeof import("@/lib/operator-lead-attributes").createLeadDiscoveryRecord;
let createLeadEligibilityRecord: typeof import("@/lib/operator-lead-attributes").createLeadEligibilityRecord;
let normalizeImportSource: typeof import("@/lib/import-identity").normalizeImportSource;

describe.skipIf(!enabled)("operator discovery import PostgreSQL atomicity", () => {
  beforeAll(async () => {
    const database = await import("@/lib/db");
    db = database.getDb();
    ({ createImportJob, persistSiteImport, recordImportFailure } =
      await import("@/lib/site-persistence"));
    ({ sampleSiteDraft } = await import("@/lib/restaurant"));
    ({ createLeadDiscoveryRecord, createLeadEligibilityRecord } =
      await import("@/lib/operator-lead-attributes"));
    ({ normalizeImportSource } = await import("@/lib/import-identity"));

    await db.$executeRawUnsafe(`
      CREATE FUNCTION "${triggerFunction}"() RETURNS trigger AS $failure$
      BEGIN
        IF NEW."type" = 'site.lead.ingested'
           AND NEW."metadata"->>'placeId' = '${failurePlaceId}' THEN
          RAISE EXCEPTION 'forced lead metadata persistence failure';
        END IF;
        RETURN NEW;
      END
      $failure$ LANGUAGE plpgsql
    `);
    await db.$executeRawUnsafe(`
      CREATE TRIGGER "${triggerName}"
      BEFORE INSERT ON "AuditEvent"
      FOR EACH ROW EXECUTE FUNCTION "${triggerFunction}"()
    `);
  });

  afterAll(async () => {
    if (!db) return;
    await db.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS "${triggerName}" ON "AuditEvent"`,
    );
    await db.$executeRawUnsafe(
      `DROP FUNCTION IF EXISTS "${triggerFunction}"()`,
    );
    await db.site.deleteMany({
      where: { slug: { in: [successfulSlug, failedSlug] } },
    });
    await db.importJob.deleteMany({
      where: {
        source: {
          in: [originalSource, failedOriginalSource],
        },
      },
    });
  });

  test("binds redirected preview and discovery evidence to one canonical site", async () => {
    const importJob = await createImportJob(originalSource, "RESTAURANT");
    const discovery = discoveryRecord("redirect-place", finalSource);
    const persisted = await persistSiteImport({
      draft: {
        ...sampleSiteDraft,
        slug: successfulSlug,
        sourceUrl: finalSource,
      },
      vertical: "RESTAURANT",
      source: originalSource,
      importJobId: importJob.id,
      actor: "system:lead-discovery",
      leadIngest: {
        name: "Redirected Lead",
        phone: "+356 2000 0000",
        address: "12 Republic Street, Valletta",
        discovery,
        audit: null,
        eligibility: createLeadEligibilityRecord({
          state: "UNKNOWN",
          evidence: {},
          updatedBy: "system:lead-discovery",
        }),
      },
    });

    const originalKey = normalizeImportSource(originalSource);
    const finalKey = normalizeImportSource(finalSource);
    const sites = await db.site.findMany({
      where: { OR: [{ sourceKey: originalKey }, { sourceKey: finalKey }] },
      select: { id: true, slug: true, sourceKey: true, status: true, attributes: true },
    });
    expect(sites).toHaveLength(1);
    expect(sites[0]).toMatchObject({
      slug: successfulSlug,
      sourceKey: finalKey,
      status: "PREVIEW_READY",
      attributes: {
        leadDiscovery: {
          placeId: "redirect-place",
          queries: [
            {
              provider: "google_places",
              query: "restaurants in Valletta",
            },
          ],
        },
      },
    });
    expect(persisted.draft.slug).toBe(successfulSlug);
    expect(
      await db.importJob.findUniqueOrThrow({ where: { id: importJob.id } }),
    ).toMatchObject({
      status: "READY",
      sourceKey: finalKey,
      siteId: sites[0]!.id,
    });
    expect(
      await db.auditEvent.count({
        where: { siteId: sites[0]!.id, type: "site.lead.ingested" },
      }),
    ).toBe(1);
  });

  test("rolls back the canonical site when lead metadata persistence fails", async () => {
    const importJob = await createImportJob(failedOriginalSource, "RESTAURANT");
    let failure: unknown;
    try {
      await persistSiteImport({
        draft: {
          ...sampleSiteDraft,
          slug: failedSlug,
          sourceUrl: failedFinalSource,
        },
        vertical: "RESTAURANT",
        source: failedOriginalSource,
        importJobId: importJob.id,
        actor: "system:lead-discovery",
        leadIngest: {
          name: "Failed Redirected Lead",
          phone: null,
          address: null,
          discovery: discoveryRecord(failurePlaceId, failedFinalSource),
          audit: null,
          eligibility: createLeadEligibilityRecord({
            state: "UNKNOWN",
            evidence: {},
            updatedBy: "system:lead-discovery",
          }),
        },
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain("forced lead metadata persistence failure");
    await recordImportFailure(importJob.id, failure);

    expect(
      await db.site.count({
        where: {
          OR: [
            { sourceKey: normalizeImportSource(failedOriginalSource) },
            { sourceKey: normalizeImportSource(failedFinalSource) },
            { slug: failedSlug },
          ],
        },
      }),
    ).toBe(0);
    expect(
      await db.importJob.findUniqueOrThrow({ where: { id: importJob.id } }),
    ).toMatchObject({ status: "FAILED", siteId: null });
  });
});

function discoveryRecord(placeId: string, websiteUrl: string) {
  return createLeadDiscoveryRecord({
    vertical: "RESTAURANT",
    city: "Valletta",
    placeId,
    sourceProvider: "google_places",
    queries: [
      { provider: "google_places", query: "restaurants in Valletta" },
    ],
    score: 42,
    reasons: ["Missing mobile viewport meta"],
    websiteUrl,
    rating: 4.2,
    reviewCount: 12,
    hasWebsite: true,
    categories: ["restaurant"],
  });
}
