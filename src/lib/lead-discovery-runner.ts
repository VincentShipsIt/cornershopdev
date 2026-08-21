import {
  buildProspectIdentity,
  fetchHomepageSignals,
  scoreWebsiteQuality,
  type DiscoveryFetch,
} from "@/lib/lead-discovery";
import {
  discoverLocalPlaces,
  type PlaceDiscoveryResult,
} from "@/lib/lead-discovery-places";
import {
  evaluateLeadCategoryFit,
  resolveLeadDiscoveryAdapter,
} from "@/lib/lead-generation/registry";
import { auditLocalSeo, renderLocalSeoOutreachEmail } from "@/lib/local-seo-audit";
import { resolveVerticalBySlug } from "@/lib/verticals/registry";
import type { VerticalId } from "@/lib/verticals/types";

export const LEAD_DISCOVERY_USAGE =
  "Usage: bun run leads:discover -- --vertical <configured-vertical> --city <city> [--limit N] [--api-url https://cornershop.dev] [--execute]";

export type LeadDiscoveryOptions = {
  vertical: VerticalId;
  city: string;
  limit: number;
  apiUrl: string;
  execute: boolean;
};

type RunnerDependencies = {
  discoverPlaces?: (input: {
    vertical: VerticalId;
    city: string;
    limit: number;
    googlePlacesApiKey?: string | null;
    nominatimBaseUrl?: string | null;
  }) => Promise<PlaceDiscoveryResult>;
  fetchHomepage?: typeof fetchHomepageSignals;
  fetchImpl?: DiscoveryFetch;
  env?: Record<string, string | undefined>;
};

export async function runLeadDiscovery(
  options: LeadDiscoveryOptions,
  dependencies: RunnerDependencies = {},
) {
  const env = dependencies.env ?? process.env;
  const adapter = resolveLeadDiscoveryAdapter(options.vertical);
  const discovery = await (
    dependencies.discoverPlaces ?? discoverLocalPlaces
  )({
    vertical: options.vertical,
    city: options.city,
    limit: options.limit,
    googlePlacesApiKey: env.GOOGLE_PLACES_API_KEY,
    nominatimBaseUrl: env.LEAD_DISCOVERY_NOMINATIM_BASE_URL,
  });

  const candidates = [];
  for (const place of discovery.places) {
    const identity = buildProspectIdentity({
      websiteUrl: place.websiteUrl,
      placeId: place.placeId,
      provider: place.provider,
    });
    const homepage = identity.sourceUrl
      ? await (dependencies.fetchHomepage ?? fetchHomepageSignals)(
          identity.sourceUrl,
          options.vertical,
        )
      : null;
    const quality = scoreWebsiteQuality({
      vertical: options.vertical,
      hasWebsite: Boolean(identity.sourceUrl),
      homepage,
      categories: place.categories,
    });
    const categoryFit = evaluateLeadCategoryFit(
      options.vertical,
      place.categories,
    );
    const audit = auditLocalSeo({
      vertical: options.vertical,
      name: place.name,
      address: place.address,
      phone: place.phone,
      city: place.city,
      websiteUrl: identity.sourceUrl,
      categories: place.categories,
      hours: place.hours,
      photoCount: place.photoCount,
      photoNewestAt: place.photoNewestAt,
      reviewCount: place.reviewCount,
      description: place.description,
      homepage,
    });
    const outreach = renderLocalSeoOutreachEmail({
      vertical: options.vertical,
      name: place.name,
      previewUrl: "/preview/pending",
      audit,
    });
    candidates.push({
      ...place,
      ...identity,
      score: quality.score,
      reasons: quality.reasons,
      categoryFit,
      audit,
      outreachSubject: outreach.subject,
    });
  }

  const plan = {
    command: "leads:discover",
    mode: options.execute ? "execute" : "dry-run",
    vertical: options.vertical,
    adapterId: adapter.adapterId,
    query: discovery.executedQueries.map(({ query }) => query).join(" | "),
    queries: discovery.executedQueries,
    city: options.city,
    limit: options.limit,
    apiUrl: options.apiUrl,
    sourceProvider: discovery.provider,
    fallbackReason: discovery.fallbackReason,
    candidateCount: candidates.length,
    candidates: candidates.map((candidate) => ({
      name: candidate.name,
      city: candidate.city,
      sourceKey: candidate.sourceKey,
      sourceUrl: candidate.sourceUrl,
      score: candidate.score,
      reasons: candidate.reasons,
      categoryFit: candidate.categoryFit,
      auditScore: candidate.audit.score,
      topFixes: candidate.audit.topFixes.map((fix) => fix.title),
      previewAction: candidate.sourceUrl ? "generate" : "await_source",
    })),
  };

  if (!options.execute) return { ...plan, preflight: "dry-run" as const };

  const token = env.OPERATOR_LEAD_INGEST_TOKEN?.trim();
  if (!token) {
    throw new Error("OPERATOR_LEAD_INGEST_TOKEN is required with --execute");
  }

  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const results = [];
  for (const candidate of candidates) {
    const response = await fetchImpl(
      new URL("/api/admin/leads/ingest", options.apiUrl),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          source: candidate.source,
          vertical: options.vertical,
          name: candidate.name,
          phone: candidate.phone,
          address: candidate.address,
          city: candidate.city,
          placeId: candidate.placeId,
          websiteUrl: candidate.sourceUrl,
          rating: candidate.rating,
          reviewCount: candidate.reviewCount,
          categories: candidate.categories,
          score: candidate.score,
          reasons: candidate.reasons,
          sourceProvider: candidate.provider,
          queries: discovery.executedQueries,
          audit: candidate.audit,
          eligibility: "UNKNOWN",
          eligibilityEvidence: {
            discovery_adapter: adapter.adapterId,
            public_source: candidate.source,
            category_fit: candidate.categoryFit,
            listing_categories:
              candidate.categories.join(", ").slice(0, 500) || "not provided",
          },
          generatePreview: Boolean(candidate.sourceUrl),
        }),
      },
    );
    const payload = (await response.json()) as {
      created?: boolean;
      reopened?: boolean;
      previewGenerated?: boolean;
      siteSlug?: string;
      error?: string;
    };
    results.push({
      sourceKey: candidate.sourceKey,
      status: response.status,
      created: Boolean(payload.created),
      reopened: Boolean(payload.reopened),
      previewGenerated: Boolean(payload.previewGenerated),
      siteSlug: payload.siteSlug ?? null,
      error: response.ok ? null : payload.error ?? "ingest failed",
    });
  }

  return {
    ...plan,
    preflight: "executed" as const,
    ingested: results.filter((row) => row.error === null).length,
    failed: results.filter((row) => row.error !== null).length,
    results,
  };
}

export function parseLeadDiscoveryArguments(args: string[]): LeadDiscoveryOptions {
  let verticalInput: string | undefined;
  let city: string | undefined;
  let limit = 50;
  let apiUrl = "https://cornershop.dev";
  let execute = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--execute") {
      if (execute) throw new Error(LEAD_DISCOVERY_USAGE);
      execute = true;
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(LEAD_DISCOVERY_USAGE);
    if (argument === "--vertical" && verticalInput === undefined) {
      verticalInput = value;
    } else if (argument === "--city" && city === undefined) {
      city = value;
    } else if (argument === "--limit") {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
        throw new Error("Limit must be an integer between 1 and 100");
      }
      limit = parsed;
    } else if (argument === "--api-url") {
      apiUrl = new URL(value).origin;
    } else {
      throw new Error(LEAD_DISCOVERY_USAGE);
    }
    index += 1;
  }

  if (!verticalInput || !city?.trim()) throw new Error(LEAD_DISCOVERY_USAGE);
  const vertical = resolveVerticalBySlug(verticalInput);
  if (!vertical) {
    throw new Error(`No discovery adapter is configured for ${verticalInput}`);
  }
  return {
    vertical,
    city: city.trim(),
    limit,
    apiUrl,
    execute,
  };
}
