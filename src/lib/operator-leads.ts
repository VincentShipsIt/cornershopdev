import "server-only";
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
  persistSiteImport,
  recordImportFailure,
  type PersistableSiteDraft,
} from "@/lib/site-persistence";
import {
  crawlSiteSource,
  generateDraftForVertical,
} from "@/lib/site-pipeline";
import type { VerticalId } from "@/lib/verticals/types";

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
}): Promise<{
  siteSlug: string;
  importJobId: string | null;
  created: boolean;
  reopened: boolean;
  urls: { preview: string; claim: string };
}> {
  const sourceKey = normalizeImportSource(input.source);
  const db = getDb();
  const existing = await db.site.findUnique({
    where: { sourceKey },
    select: { id: true, slug: true, status: true },
  });

  if (existing) {
    if (!mutableLeadStatuses.has(existing.status)) {
      throw new OperatorLeadError(
        "This business is already claimed and cannot be reopened as a prospect.",
        409,
      );
    }
    await db.$transaction(async (tx) => {
      const reopened = await tx.site.updateMany({
        where: {
          id: existing.id,
          status: { in: ["PROSPECT", "PREVIEW_READY"] },
        },
        data: {
          status: "PREVIEW_READY",
          ...(input.contactEmail
            ? { leadContactEmail: input.contactEmail }
            : {}),
        },
      });
      if (reopened.count !== 1) {
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
    });
    return {
      siteSlug: existing.slug,
      importJobId: null,
      created: false,
      reopened: true,
      urls: buildImportUrls(existing.slug),
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
          error:
            recordError instanceof Error ? recordError.message : "unknown",
        });
      }
    }
    if (error instanceof OperatorLeadError) throw error;
    throw new OperatorLeadError(importFailureMessage(error), 400);
  }
}

export async function recordOperatorLeadAction(input: {
  siteSlug: string;
  action: "add_note" | "complete_review";
  note: string | null;
  actor: string;
}): Promise<{ createdAt: Date }> {
  const note = input.note?.trim() || null;
  if (input.action === "add_note" && !note) {
    throw new OperatorLeadError("Write a note before saving.", 400);
  }
  const db = getDb();
  return db.$transaction(async (tx) => {
    const site = await tx.site.findUnique({
      where: { slug: input.siteSlug },
      select: { id: true },
    });
    if (!site) throw new OperatorLeadError("Lead not found.", 404);
    const createdAt = new Date();
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
