import { Vertical } from "@/generated/prisma/enums";
import {
  buildProspectIdentity,
  fetchHomepageSignals,
  scoreWebsiteQuality,
} from "@/lib/lead-discovery";
import { discoverLocalPlaces } from "@/lib/lead-discovery-places";
import { auditLocalSeo, renderLocalSeoOutreachEmail } from "@/lib/local-seo-audit";

const usage =
  "Usage: bun run leads:discover -- --vertical restaurant --city <city> [--limit N] [--api-url https://cornershop.dev] [--execute]";

try {
  const summary = await main(process.argv.slice(2));
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Lead discovery failed");
  process.exitCode = 1;
}

async function main(args: string[]) {
  const options = parseArguments(args);
  const discovery = await discoverLocalPlaces({
    city: options.city,
    limit: options.limit,
    googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY,
  });

  const candidates = [];
  for (const place of discovery.places) {
    const identity = buildProspectIdentity({
      websiteUrl: place.websiteUrl,
      placeId: place.placeId,
      provider: place.provider,
    });
    const homepage = identity.sourceUrl
      ? await fetchHomepageSignals(identity.sourceUrl)
      : null;
    const quality = scoreWebsiteQuality({
      hasWebsite: Boolean(identity.sourceUrl),
      homepage,
    });
    const audit = auditLocalSeo({
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
      name: place.name,
      previewUrl: "/preview/pending",
      audit,
    });
    candidates.push({
      name: place.name,
      city: place.city,
      placeId: place.placeId,
      sourceProvider: place.provider,
      source: identity.source,
      sourceKey: identity.sourceKey,
      sourceUrl: identity.sourceUrl,
      phone: place.phone,
      address: place.address,
      rating: place.rating,
      reviewCount: place.reviewCount,
      score: quality.score,
      reasons: quality.reasons,
      audit,
      outreachSubject: outreach.subject,
    });
  }

  const plan = {
    command: "leads:discover",
    mode: options.execute ? "execute" : "dry-run",
    vertical: options.vertical,
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
      auditScore: candidate.audit.score,
      topFixes: candidate.audit.topFixes.map((fix) => fix.title),
    })),
  };

  if (!options.execute) {
    return { ...plan, preflight: "dry-run" };
  }

  const token = process.env.OPERATOR_LEAD_INGEST_TOKEN?.trim();
  if (!token) {
    throw new Error("OPERATOR_LEAD_INGEST_TOKEN is required with --execute");
  }

  const results = [];
  for (const candidate of candidates) {
    const response = await fetch(new URL("/api/admin/leads/ingest", options.apiUrl), {
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
        score: candidate.score,
        reasons: candidate.reasons,
        sourceProvider: candidate.sourceProvider,
        audit: candidate.audit,
      }),
    });
    const payload = (await response.json()) as {
      ok?: boolean;
      created?: boolean;
      reopened?: boolean;
      siteSlug?: string;
      error?: string;
    };
    results.push({
      sourceKey: candidate.sourceKey,
      status: response.status,
      created: Boolean(payload.created),
      reopened: Boolean(payload.reopened),
      siteSlug: payload.siteSlug ?? null,
      error: response.ok ? null : payload.error ?? "ingest failed",
    });
  }

  return {
    ...plan,
    preflight: "executed",
    ingested: results.filter((row) => row.error === null).length,
    failed: results.filter((row) => row.error !== null).length,
    results,
  };
}

function parseArguments(args: string[]): {
  vertical: typeof Vertical.RESTAURANT;
  city: string;
  limit: number;
  apiUrl: string;
  execute: boolean;
} {
  let vertical: string | undefined;
  let city: string | undefined;
  let limit = 50;
  let apiUrl = "https://cornershop.dev";
  let execute = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--execute") {
      if (execute) throw new Error(usage);
      execute = true;
      continue;
    }
    if (argument === "--vertical") {
      const value = args[index + 1];
      if (vertical !== undefined || !value || value.startsWith("--")) {
        throw new Error(usage);
      }
      vertical = value;
      index += 1;
      continue;
    }
    if (argument === "--city") {
      const value = args[index + 1];
      if (city !== undefined || !value || value.startsWith("--")) {
        throw new Error(usage);
      }
      city = value;
      index += 1;
      continue;
    }
    if (argument === "--limit") {
      const value = args[index + 1];
      const parsed = Number(value);
      if (!value || value.startsWith("--") || !Number.isInteger(parsed)) {
        throw new Error(usage);
      }
      if (parsed < 1 || parsed > 100) {
        throw new Error("Limit must be an integer between 1 and 100");
      }
      limit = parsed;
      index += 1;
      continue;
    }
    if (argument === "--api-url") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(usage);
      apiUrl = new URL(value).origin;
      index += 1;
      continue;
    }
    throw new Error(usage);
  }

  if (!vertical || !city) throw new Error(usage);
  if (vertical.toLowerCase() !== "restaurant") {
    throw new Error("Only --vertical restaurant is supported");
  }

  return {
    vertical: Vertical.RESTAURANT,
    city: city.trim(),
    limit,
    apiUrl,
    execute,
  };
}
