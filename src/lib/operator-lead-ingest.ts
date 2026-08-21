import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import {
  buildImportUrls,
  normalizeImportSource,
  slugCollisionCandidate,
  storedImportSource,
} from "@/lib/import-identity";
import {
  createLeadDiscoveryRecord,
  mergeOperatorLeadAttributes,
  resolveProspectIngestAction,
} from "@/lib/operator-lead-attributes";
import { OperatorLeadError } from "@/lib/operator-leads";
import { OPERATOR_LEAD_INGEST_ACTOR } from "@/lib/operator-lead-ingest-auth";
import type { LeadDiscoveryProvider } from "@/lib/lead-discovery";
import type { LocalSeoAuditResult } from "@/lib/local-seo-audit";
import { slugify } from "@/lib/site-draft";
import type { VerticalId } from "@/lib/verticals/types";

export type IngestOperatorProspectInput = {
  source: string;
  vertical: VerticalId;
  name: string;
  phone?: string | null;
  address?: string | null;
  city: string;
  placeId?: string | null;
  websiteUrl?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  score: number;
  reasons: string[];
  discoveredAt?: string;
  sourceProvider?: LeadDiscoveryProvider;
  audit?: LocalSeoAuditResult | null;
};

export type IngestOperatorProspectResult = {
  siteSlug: string;
  importJobId: null;
  created: boolean;
  reopened: boolean;
  urls: { preview: string; claim: string };
};

export async function ingestOperatorProspectLead(
  input: IngestOperatorProspectInput,
): Promise<IngestOperatorProspectResult> {
  const source = input.source.trim();
  const sourceKey = normalizeImportSource(source);
  const sourceUrl = looksLikeStoredUrl(source) ? storedImportSource(source) : null;
  const vertical = input.vertical;
  const discovery = createLeadDiscoveryRecord({
    city: input.city,
    placeId: input.placeId ?? null,
    sourceProvider: input.sourceProvider ?? "nominatim",
    score: input.score,
    reasons: input.reasons,
    discoveredAt: input.discoveredAt,
    websiteUrl: input.websiteUrl ?? sourceUrl,
    rating: input.rating ?? null,
    reviewCount: input.reviewCount ?? null,
    hasWebsite: Boolean(input.websiteUrl ?? sourceUrl),
  });
  const db = getDb();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(async (tx) => {
        const existing = await tx.site.findUnique({
          where: { sourceKey },
          select: {
            id: true,
            slug: true,
            status: true,
            vertical: true,
            phone: true,
            address: true,
            sourceUrl: true,
            attributes: true,
          },
        });
        const action = resolveProspectIngestAction(existing, vertical);
        if (action === "conflict") {
          throw new OperatorLeadError(
            "This business is already claimed and cannot be reopened as a prospect.",
            409,
          );
        }

        const attributes = mergeOperatorLeadAttributes(
          existing?.attributes,
          discovery,
          input.audit ?? null,
        ) as Prisma.InputJsonValue;
        const phone = firstNonEmpty(input.phone, existing?.phone);
        const address = firstNonEmpty(input.address, existing?.address);
        const nextSourceUrl =
          firstNonEmpty(input.websiteUrl, existing?.sourceUrl) ?? sourceUrl;

        if (existing && action === "update") {
          await tx.site.update({
            where: { id: existing.id },
            data: {
              name: input.name,
              phone,
              address,
              sourceUrl: nextSourceUrl,
              attributes,
            },
          });
          await tx.auditEvent.create({
            data: {
              type: "site.lead.ingest.updated",
              actor: OPERATOR_LEAD_INGEST_ACTOR,
              metadata: {
                sourceKey,
                city: discovery.city,
                score: discovery.score,
                placeId: discovery.placeId,
                previousStatus: existing.status,
              },
              siteId: existing.id,
            },
          });
          return {
            siteSlug: existing.slug,
            importJobId: null,
            created: false,
            reopened: true,
            urls: buildImportUrls(existing.slug),
          };
        }

        const slug = await reserveProspectSlug(tx, input.name, vertical);
        const created = await tx.site.create({
          data: {
            slug,
            name: input.name,
            eyebrow: `${input.city} prospect`,
            phone,
            address,
            sourceUrl: nextSourceUrl,
            sourceKey,
            vertical,
            status: "PROSPECT",
            attributes,
          },
          select: { id: true, slug: true },
        });
        await tx.auditEvent.create({
          data: {
            type: "site.lead.ingested",
            actor: OPERATOR_LEAD_INGEST_ACTOR,
            metadata: {
              sourceKey,
              city: discovery.city,
              score: discovery.score,
              placeId: discovery.placeId,
            },
            siteId: created.id,
          },
        });
        return {
          siteSlug: created.slug,
          importJobId: null,
          created: true,
          reopened: false,
          urls: buildImportUrls(created.slug),
        };
      });
    } catch (error) {
      if (error instanceof OperatorLeadError) throw error;
      if (attempt < 2 && isRetryablePrismaError(error)) continue;
      throw error;
    }
  }

  throw new OperatorLeadError("The prospect lead could not be ingested.", 503);
}

async function reserveProspectSlug(
  tx: Prisma.TransactionClient,
  name: string,
  vertical: VerticalId,
): Promise<string> {
  const requestedSlug = slugify(name) || vertical.toLowerCase();
  for (let collisionIndex = 0; collisionIndex < 100; collisionIndex += 1) {
    const candidate = slugCollisionCandidate(requestedSlug, collisionIndex);
    const collision = await tx.site.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!collision) return candidate;
  }
  throw new OperatorLeadError("A unique preview URL could not be reserved.", 409);
}

function firstNonEmpty(
  incoming: string | null | undefined,
  existing: string | null | undefined,
): string | null {
  const next = incoming?.trim();
  if (next) return next;
  const current = existing?.trim();
  return current || null;
}

function looksLikeStoredUrl(source: string): boolean {
  return /^(?:https?:\/\/|www\.)/i.test(source.trim());
}

function isRetryablePrismaError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "P2002" || error.code === "P2034")
  );
}
