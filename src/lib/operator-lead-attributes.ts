import { z } from "zod";
import { Vertical } from "@/generated/prisma/enums";
import type { LeadDiscoveryProvider } from "@/lib/lead-discovery";
import type { ExecutedPlaceQuery } from "@/lib/lead-discovery-places";
import { resolveLeadDiscoveryAdapter } from "@/lib/lead-generation/registry";
import type { VerticalId } from "@/lib/verticals/types";
import {
  localSeoAuditResultSchema,
  type LocalSeoAuditResult,
} from "@/lib/local-seo-audit";
import {
  configuredOutreachController,
  evaluateElectronicOutreachEligibility,
  type OutreachEligibilityReason,
} from "@/lib/electronic-outreach-eligibility";

export const LEAD_DISCOVERY_ATTRIBUTE_KEY = "leadDiscovery";
export const LOCAL_SEO_AUDIT_ATTRIBUTE_KEY = "localSeoAudit";
export const LEAD_ELIGIBILITY_ATTRIBUTE_KEY = "leadEligibility";

export const leadEligibilityStateSchema = z.enum([
  "UNKNOWN",
  "ELIGIBLE",
  "INELIGIBLE",
]);
export const leadEligibilityEvidenceSchema = z
  .record(z.string().trim().min(1).max(80), z.string().trim().min(1).max(500))
  .refine((record) => Object.keys(record).length <= 20, {
    message: "At most 20 eligibility evidence fields are allowed",
  });
export const leadEligibilityRecordSchema = z.object({
  state: leadEligibilityStateSchema,
  evidence: leadEligibilityEvidenceSchema,
  updatedAt: z.string().datetime({ offset: true }),
  updatedBy: z.string().trim().min(1).max(160),
});

export const leadDiscoveryRecordSchema = z.object({
  vertical: z.enum(Vertical),
  adapterId: z.string().trim().min(1).max(80),
  query: z.string().trim().min(1).max(200),
  queries: z
    .array(
      z.object({
        provider: z.enum(["google_places", "nominatim"]),
        query: z.string().trim().min(1).max(200),
      }),
    )
    .max(20)
    .default([]),
  city: z.string().trim().min(1).max(80),
  placeId: z.string().trim().max(200).nullable(),
  sourceProvider: z.enum(["google_places", "nominatim"]),
  score: z.number().int().min(0).max(100),
  reasons: z.array(z.string().trim().min(1).max(200)).max(20),
  discoveredAt: z.string().trim().min(1),
  websiteUrl: z.string().trim().max(500).nullable(),
  rating: z.number().min(0).max(5).nullable(),
  reviewCount: z.number().int().min(0).nullable(),
  hasWebsite: z.boolean(),
  categories: z.array(z.string().trim().min(1).max(100)).max(20),
});

export type LeadDiscoveryRecord = z.infer<typeof leadDiscoveryRecordSchema>;
export type LeadEligibilityRecord = z.infer<typeof leadEligibilityRecordSchema>;

export type OperatorLeadDiscoveryView = {
  score: number;
  reasons: string[];
  city: string | null;
  discoveredAt: Date | null;
  placeId: string | null;
};

export type OperatorLeadEligibilityView = LeadEligibilityRecord;

export type LeadOutreachEligibilityDecision =
  | { allowed: true; record: LeadEligibilityRecord }
  | {
      allowed: false;
      reason: OutreachEligibilityReason;
      message: string;
    };

export type OperatorLocalSeoAuditView = {
  score: number;
  topFixes: Array<{ id: string; title: string }>;
  auditedAt: Date | null;
};

export function createLeadDiscoveryRecord(input: {
  vertical?: VerticalId;
  query?: string;
  queries?: ExecutedPlaceQuery[];
  city: string;
  placeId: string | null;
  sourceProvider: LeadDiscoveryProvider;
  score: number;
  reasons: string[];
  discoveredAt?: string;
  websiteUrl: string | null;
  rating: number | null;
  reviewCount: number | null;
  hasWebsite: boolean;
  categories?: string[];
}): LeadDiscoveryRecord {
  const vertical = input.vertical ?? Vertical.RESTAURANT;
  const adapter = resolveLeadDiscoveryAdapter(vertical);
  const fallbackQuery =
    input.sourceProvider === "google_places"
      ? adapter.placeSearch.googleQuery(input.city)
      : adapter.placeSearch.nominatimQuery(input.city);
  const queries =
    input.queries ?? [
      {
        provider: input.sourceProvider,
        query: input.query ?? fallbackQuery,
      },
    ];
  return leadDiscoveryRecordSchema.parse({
    vertical,
    adapterId: adapter.adapterId,
    query: input.query ?? queries[0]?.query ?? fallbackQuery,
    queries,
    city: input.city,
    placeId: input.placeId,
    sourceProvider: input.sourceProvider,
    score: input.score,
    reasons: input.reasons,
    discoveredAt: input.discoveredAt ?? new Date().toISOString(),
    websiteUrl: input.websiteUrl,
    rating: input.rating,
    reviewCount: input.reviewCount,
    hasWebsite: input.hasWebsite,
    categories: input.categories ?? [],
  });
}

export function createLeadEligibilityRecord(input: {
  state?: z.infer<typeof leadEligibilityStateSchema>;
  evidence?: Record<string, string>;
  updatedBy: string;
  updatedAt?: string;
}): LeadEligibilityRecord {
  return leadEligibilityRecordSchema.parse({
    state: input.state ?? "UNKNOWN",
    evidence: input.evidence ?? {},
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  });
}

export function mergeOperatorLeadAttributes(
  existing: unknown,
  discovery: LeadDiscoveryRecord,
  audit: LocalSeoAuditResult | null,
  eligibility?: LeadEligibilityRecord,
): Record<string, unknown> {
  const current = asAttributeRecord(existing);
  return {
    ...current,
    [LEAD_DISCOVERY_ATTRIBUTE_KEY]: discovery,
    [LOCAL_SEO_AUDIT_ATTRIBUTE_KEY]:
      audit ?? current[LOCAL_SEO_AUDIT_ATTRIBUTE_KEY] ?? null,
    [LEAD_ELIGIBILITY_ATTRIBUTE_KEY]: resolveAutomatedLeadEligibility(
      parseLeadEligibility(current),
      eligibility,
      discovery,
    ),
  };
}

/**
 * Automated discovery only ever produces UNKNOWN eligibility. An operator's
 * ELIGIBLE/INELIGIBLE decision and its consent evidence are owned by the
 * operator console, so a routine discovery rerun must never downgrade or
 * delete them; only an explicit operator action may replace that record.
 */
function resolveAutomatedLeadEligibility(
  current: LeadEligibilityRecord | null,
  incoming: LeadEligibilityRecord | undefined,
  discovery: LeadDiscoveryRecord,
): LeadEligibilityRecord {
  if (current && (!incoming || incoming.state === "UNKNOWN")) {
    return current;
  }
  return (
    incoming ??
    current ??
    createLeadEligibilityRecord({
      updatedBy: "system:lead-discovery",
      updatedAt: discovery.discoveredAt,
    })
  );
}

/**
 * Re-binds the persisted row's operator-owned eligibility onto attributes
 * merged from a freshly generated draft. The exact-source update path builds
 * draft attributes from crawl output, which never contains the live row's
 * eligibility record, so without this re-bind the wholesale attribute write
 * would silently drop operator evidence on every rerun.
 */
export function preservePersistedLeadEligibility(
  incomingAttributes: Record<string, unknown>,
  persistedAttributes: unknown,
): Record<string, unknown> {
  const persistedEligibility = parseLeadEligibility(persistedAttributes);
  if (!persistedEligibility) return incomingAttributes;
  const incoming = parseLeadEligibility(incomingAttributes);
  if (incoming && incoming.state !== "UNKNOWN") return incomingAttributes;
  return {
    ...incomingAttributes,
    [LEAD_ELIGIBILITY_ATTRIBUTE_KEY]: persistedEligibility,
  };
}

export function mergeLeadEligibilityAttributes(
  existing: unknown,
  eligibility: LeadEligibilityRecord,
): Record<string, unknown> {
  return {
    ...asAttributeRecord(existing),
    [LEAD_ELIGIBILITY_ATTRIBUTE_KEY]: eligibility,
  };
}

export function parseLeadDiscovery(
  attributes: unknown,
): LeadDiscoveryRecord | null {
  const parsed = leadDiscoveryRecordSchema.safeParse(
    asAttributeRecord(attributes)[LEAD_DISCOVERY_ATTRIBUTE_KEY],
  );
  return parsed.success ? parsed.data : null;
}

export function parseLeadEligibility(
  attributes: unknown,
): LeadEligibilityRecord | null {
  const parsed = leadEligibilityRecordSchema.safeParse(
    asAttributeRecord(attributes)[LEAD_ELIGIBILITY_ATTRIBUTE_KEY],
  );
  return parsed.success ? parsed.data : null;
}

/**
 * Outreach is an operator decision, not an inference from discovery data.
 * Category matches and public listings may be retained as evidence, but they
 * cannot authorize contact on their own. Electronic outreach requires a
 * verified channel-specific record bound to the exact private recipient.
 */
export function evaluateLeadOutreachEligibility(
  attributes: unknown,
  expectedRecipient: string | null,
  expectedController: string | null = configuredOutreachController(),
): LeadOutreachEligibilityDecision {
  const record = parseLeadEligibility(attributes);
  const decision = evaluateElectronicOutreachEligibility({
    state: record?.state ?? "UNKNOWN",
    evidence: record?.evidence ?? {},
    expectedRecipient,
    expectedController,
  });
  if (!decision.allowed) return decision;
  if (!record) throw new Error("Eligible outreach record was not parsed");
  return { allowed: true, record };
}

export function toOperatorLeadEligibilityView(
  attributes: unknown,
): OperatorLeadEligibilityView {
  return (
    parseLeadEligibility(attributes) ??
    createLeadEligibilityRecord({
      updatedBy: "system:legacy-lead",
      updatedAt: new Date(0).toISOString(),
    })
  );
}

export function parseLocalSeoAudit(
  attributes: unknown,
): LocalSeoAuditResult | null {
  const parsed = localSeoAuditResultSchema.safeParse(
    asAttributeRecord(attributes)[LOCAL_SEO_AUDIT_ATTRIBUTE_KEY],
  );
  return parsed.success ? parsed.data : null;
}

export function toOperatorLeadDiscoveryView(
  attributes: unknown,
): OperatorLeadDiscoveryView | null {
  const discovery = parseLeadDiscovery(attributes);
  if (!discovery) return null;
  const discoveredAt = Date.parse(discovery.discoveredAt);
  return {
    score: discovery.score,
    reasons: discovery.reasons,
    city: discovery.city,
    discoveredAt: Number.isFinite(discoveredAt) ? new Date(discoveredAt) : null,
    placeId: discovery.placeId,
  };
}

export function toOperatorLocalSeoAuditView(
  attributes: unknown,
): OperatorLocalSeoAuditView | null {
  const audit = parseLocalSeoAudit(attributes);
  if (!audit) return null;
  const auditedAt = Date.parse(audit.auditedAt);
  return {
    score: audit.score,
    topFixes: audit.topFixes.map((fix) => ({ id: fix.id, title: fix.title })),
    auditedAt: Number.isFinite(auditedAt) ? new Date(auditedAt) : null,
  };
}

export function compareOperatorSitesByDiscoveryScore(
  left: {
    discovery: { score: number } | null;
    createdAt: Date;
  },
  right: {
    discovery: { score: number } | null;
    createdAt: Date;
  },
): number {
  const leftHasScore = left.discovery !== null;
  const rightHasScore = right.discovery !== null;
  if (leftHasScore && rightHasScore && left.discovery && right.discovery) {
    if (left.discovery.score !== right.discovery.score) {
      return left.discovery.score - right.discovery.score;
    }
  }
  if (leftHasScore !== rightHasScore) return leftHasScore ? -1 : 1;
  return right.createdAt.getTime() - left.createdAt.getTime();
}

export function resolveProspectIngestAction(
  existing: { status: string; vertical: string } | null,
  vertical: string,
): "create" | "update" | "conflict" {
  if (!existing) return "create";
  if (existing.vertical !== vertical) return "conflict";
  if (existing.status === "PROSPECT" || existing.status === "PREVIEW_READY") {
    return "update";
  }
  return "conflict";
}

function asAttributeRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return { ...(value as Record<string, unknown>) };
}
