import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { Vertical } from "@/generated/prisma/enums";
import { getDb } from "@/lib/db";
import {
  buildImportUrls,
  importFailureMessage,
  normalizeImportSource,
} from "@/lib/import-identity";
import { mutableLeadStatuses } from "@/lib/lead-status";
import {
  createImportJob,
  ImportConflictError,
  persistSiteImport,
  recordImportFailure,
  type PersistableSiteDraft,
  type PersistedLeadIngest,
} from "@/lib/site-persistence";
import { crawlSiteSource, generateDraftForVertical } from "@/lib/site-pipeline";
import type { VerticalId } from "@/lib/verticals/types";
import {
  createLeadEligibilityRecord,
  mergeLeadEligibilityAttributes,
  mergeOperatorLeadAttributes,
} from "@/lib/operator-lead-attributes";

/**
 * Lead statuses that a site may still be reopened or outreached from.
 * Re-exported from `@/lib/lead-status` (see that module for why it lives on
 * its own) so existing importers of this rule from here keep working.
 */
export { mutableLeadStatuses };

export class OperatorLeadError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404 | 409 | 503 = 400,
  ) {
    super(message);
    this.name = "OperatorLeadError";
  }
}

export async function createOrReopenOperatorLead(input: {
  source: string;
  vertical: VerticalId;
  actor: string;
  contactEmail?: string;
  leadIngest?: PersistedLeadIngest;
}): Promise<{
  siteSlug: string;
  importJobId: string | null;
  created: boolean;
  reopened: boolean;
  urls: { preview: string; claim: string };
}> {
  const sourceKey = normalizeImportSource(input.source);
  const db = getDb();

  const reopened = await db.$transaction(async (tx) => {
    // Locked read: the row lock is held from the attribute read until commit,
    // so a concurrent operator eligibility edit can never land between the
    // merge input and the attribute write.
    const locked = await tx.$queryRaw<
      Array<{
        id: string;
        slug: string;
        status: string;
        vertical: string;
        attributes: unknown;
      }>
    >`
      SELECT "id", "slug", "status", "vertical", "attributes"
      FROM "Site"
      WHERE "sourceKey" = ${sourceKey}
      FOR UPDATE
    `;
    const existing = locked[0];
    if (!existing) return null;

    if (existing.vertical !== input.vertical) {
      throw new OperatorLeadError(
        "This source already belongs to another vertical and was not changed.",
        409,
      );
    }
    if (!mutableLeadStatuses.has(existing.status)) {
      throw new OperatorLeadError(
        "This business is already claimed and cannot be reopened as a prospect.",
        409,
      );
    }
    const result = await tx.site.updateMany({
      where: {
        id: existing.id,
        vertical: input.vertical,
        status: { in: ["PROSPECT", "PREVIEW_READY"] },
      },
      data: {
        status: "PREVIEW_READY",
        ...(input.leadIngest
          ? {
              name: input.leadIngest.name,
              phone: input.leadIngest.phone?.trim() || undefined,
              address: input.leadIngest.address?.trim() || undefined,
              attributes: mergeOperatorLeadAttributes(
                existing.attributes,
                input.leadIngest.discovery,
                input.leadIngest.audit,
                input.leadIngest.eligibility,
              ) as Prisma.InputJsonValue,
            }
          : {}),
        ...(input.contactEmail ? { leadContactEmail: input.contactEmail } : {}),
      },
    });
    if (result.count !== 1) {
      throw new OperatorLeadError(
        "This lead changed while it was being reopened.",
        409,
      );
    }
    await tx.auditEvent.create({
      data: {
        type: "site.lead.reopened",
        actor: input.actor,
        metadata: {
          sourceKey,
          previousStatus: existing.status,
          contactEmailUpdated: Boolean(input.contactEmail),
        },
        siteId: existing.id,
      },
    });
    if (input.leadIngest) {
      await tx.auditEvent.create({
        data: {
          type: "site.lead.ingest.updated",
          actor: input.actor,
          metadata: {
            sourceKey,
            city: input.leadIngest.discovery.city,
            score: input.leadIngest.discovery.score,
            placeId: input.leadIngest.discovery.placeId,
            adapterId: input.leadIngest.discovery.adapterId,
            eligibility: input.leadIngest.eligibility.state,
            previousStatus: existing.status,
          },
          siteId: existing.id,
        },
      });
    }
    return { slug: existing.slug };
  });

  if (reopened) {
    return {
      siteSlug: reopened.slug,
      importJobId: null,
      created: false,
      reopened: true,
      urls: buildImportUrls(reopened.slug),
    };
  }

  let importJobId: string | null = null;
  try {
    const importJob = await createImportJob(input.source, input.vertical);
    importJobId = importJob.id;
    const extracted = await crawlSiteSource(input.source, input.vertical);
    const draft = await generateDraftForVertical(extracted, input.vertical);
    const persisted = await persistSiteImport<PersistableSiteDraft>({
      draft,
      vertical: input.vertical,
      source: input.source,
      importJobId,
      actor: input.actor,
      contactEmail: input.contactEmail,
      leadIngest: input.leadIngest,
    });
    return {
      siteSlug: persisted.draft.slug,
      importJobId,
      created: persisted.created,
      reopened: !persisted.created,
      urls: persisted.urls,
    };
  } catch (error) {
    if (importJobId) {
      try {
        await recordImportFailure(importJobId, error);
      } catch (recordError) {
        console.error("[operator-lead] failed to record import failure", {
          importJobId,
          error: recordError instanceof Error ? recordError.message : "unknown",
        });
      }
    }
    if (error instanceof OperatorLeadError) throw error;
    if (error instanceof ImportConflictError) {
      throw new OperatorLeadError(
        "This source changed, was claimed, or belongs to another vertical; it was not modified.",
        409,
      );
    }
    throw new OperatorLeadError(importFailureMessage(error), 400);
  }
}

export async function recordOperatorLeadAction(input: {
  siteSlug: string;
  action: "add_note" | "complete_review" | "set_eligibility";
  note: string | null;
  actor: string;
  eligibility?: "UNKNOWN" | "ELIGIBLE" | "INELIGIBLE";
  eligibilityEvidence?: Record<string, string>;
}): Promise<{ createdAt: Date }> {
  const note = input.note?.trim() || null;
  if (input.action === "add_note" && !note) {
    throw new OperatorLeadError("Write a note before saving.", 400);
  }
  const db = getDb();
  return db.$transaction(async (tx) => {
    const site = await tx.site.findUnique({
      where: { slug: input.siteSlug },
      select: { id: true, attributes: true },
    });
    if (!site) throw new OperatorLeadError("Lead not found.", 404);
    const createdAt = new Date();
    if (input.action === "set_eligibility") {
      const eligibility = createLeadEligibilityRecord({
        state: input.eligibility,
        evidence: input.eligibilityEvidence,
        updatedBy: input.actor,
        updatedAt: createdAt.toISOString(),
      });
      await tx.site.update({
        where: { id: site.id },
        data: {
          attributes: mergeLeadEligibilityAttributes(
            site.attributes,
            eligibility,
          ) as Prisma.InputJsonValue,
        },
      });
      await tx.auditEvent.create({
        data: {
          type: "site.lead.eligibility.updated",
          actor: input.actor,
          metadata: {
            state: eligibility.state,
            evidenceFields: Object.keys(eligibility.evidence).sort(),
          },
          siteId: site.id,
          createdAt,
        },
      });
      return { createdAt };
    }
    await tx.auditEvent.create({
      data: {
        type:
          input.action === "add_note"
            ? "operator.note.created"
            : "site.review.completed",
        actor: input.actor,
        metadata: note ? { note } : {},
        siteId: site.id,
        createdAt,
      },
    });
    return { createdAt };
  });
}

export const DEFAULT_OPERATOR_VERTICAL = Vertical.RESTAURANT;
