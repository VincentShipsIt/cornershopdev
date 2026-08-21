import {
  normalizeImportSource,
  storedImportSource,
} from "@/lib/import-identity";
import { Vertical } from "@/generated/prisma/enums";
import {
  evaluateLeadCategoryFit,
  resolveLeadDiscoveryAdapter,
} from "@/lib/lead-generation/registry";
import type { VerticalId } from "@/lib/verticals/types";
import { fetchPublicHtml } from "@/lib/importer";

/**
 * Cheap homepage signals only. A local runner cannot afford Lighthouse or a
 * headless browser for 50 businesses: no LCP/CLS, no painted layout, and no
 * JS-rendered catalog. Scoring uses the first HTML response, headers, and href
 * text.
 */
export const LEAD_DISCOVERY_CHEAP_CHECKS = [
  "website listed",
  "final URL is https",
  "viewport meta present",
  "viewport is not a fixed desktop width",
  "frameset or Flash markup",
  "vertical-specific catalog href or text",
  "vertical-specific conversion href, text, or known provider",
  "document title",
  "html byte size and script tag count",
  "Last-Modified header when the origin sends one",
] as const;

export const LEAD_DISCOVERY_USER_AGENT =
  "Cornershopdev Lead Discovery/2.0 (+https://cornershop.dev; local business discovery)";

export type LeadDiscoveryProvider = "google_places" | "nominatim";

export type HomepageSignals = {
  isFetched: boolean;
  finalUrl: string | null;
  isHttps: boolean;
  hasViewport: boolean;
  isDesktopOnlyViewport: boolean;
  hasDesktopOnlyMarkup: boolean;
  hasCatalogHint: boolean;
  hasConversionHint: boolean;
  hasBusinessJsonLd: boolean;
  /** @deprecated Read `hasCatalogHint`; retained for stored/test compatibility. */
  hasMenuHint: boolean;
  /** @deprecated Read `hasConversionHint`; retained for stored/test compatibility. */
  hasBookingHint: boolean;
  hasTitle: boolean;
  hasMetaDescription: boolean;
  /** @deprecated Read `hasBusinessJsonLd`; retained for stored/test compatibility. */
  hasRestaurantJsonLd: boolean;
  scriptCount: number;
  htmlBytes: number;
  lastModifiedAt: string | null;
  title: string;
  metaDescription: string;
  pageText: string;
};

export type SiteQualityScore = {
  score: number;
  reasons: string[];
};

export type ProspectIdentity = {
  source: string;
  sourceKey: string;
  sourceUrl: string | null;
};

const MAX_PAGE_TEXT_CHARS = 8_000;

export function buildProspectIdentity(input: {
  websiteUrl: string | null;
  placeId: string;
  provider: LeadDiscoveryProvider;
}): ProspectIdentity {
  const websiteUrl = normalizeOptionalWebsite(input.websiteUrl);
  if (websiteUrl) {
    const source = storedImportSource(websiteUrl);
    return {
      source,
      sourceKey: normalizeImportSource(source),
      sourceUrl: source,
    };
  }

  const providerKey = input.provider === "google_places" ? "google" : "osm";
  const source = `place:${providerKey}:${input.placeId.trim()}`;
  return {
    source,
    sourceKey: normalizeImportSource(source),
    sourceUrl: null,
  };
}

export function scoreWebsiteQuality(input: {
  vertical?: VerticalId;
  hasWebsite: boolean;
  homepage: HomepageSignals | null;
  categories?: string[];
}): SiteQualityScore {
  const vertical = input.vertical ?? Vertical.RESTAURANT;
  const adapter = resolveLeadDiscoveryAdapter(vertical);
  const reasons: string[] = [];
  let score = 100;
  if (
    evaluateLeadCategoryFit(vertical, input.categories ?? []) === "mismatch"
  ) {
    score -= 12;
    reasons.push(
      `Listing categories do not confirm a ${adapter.eligibility.categoryLabel}`,
    );
  }

  if (!input.hasWebsite) {
    return clampScore(score - 40, [...reasons, "No public website listed"]);
  }

  const homepage = input.homepage;
  if (!homepage || !homepage.isFetched) {
    return clampScore(score - 55, [
      ...reasons,
      "Website listed but the homepage did not respond",
    ]);
  }

  if (!homepage.isHttps) {
    score -= 15;
    reasons.push("Homepage is HTTP, not HTTPS");
  }
  if (!homepage.hasViewport) {
    score -= 15;
    reasons.push("Missing mobile viewport meta");
  } else if (homepage.isDesktopOnlyViewport) {
    score -= 12;
    reasons.push("Viewport looks desktop-only");
  }
  if (homepage.hasDesktopOnlyMarkup) {
    score -= 10;
    reasons.push("Homepage uses frameset or Flash");
  }
  if (!homepage.hasCatalogHint) {
    score -= 8;
    reasons.push(
      `No ${adapter.homepage.catalogLabel} link found on the homepage`,
    );
  }
  if (!homepage.hasConversionHint) {
    score -= 8;
    reasons.push(`No ${adapter.homepage.conversionLabel} link found`);
  }
  if (!homepage.hasTitle) {
    score -= 5;
    reasons.push("Homepage title is missing");
  }
  if (homepage.htmlBytes > 800_000) {
    score -= 5;
    reasons.push("Homepage HTML is unusually large");
  }
  if (homepage.scriptCount > 20) {
    score -= 5;
    reasons.push("Homepage loads many scripts");
  }
  if (isStaleLastModified(homepage.lastModifiedAt)) {
    score -= 5;
    reasons.push("Homepage Last-Modified is older than two years");
  }

  return clampScore(score, reasons);
}

export type DiscoveryFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export async function fetchHomepageSignals(
  rawUrl: string,
  vertical: VerticalId = Vertical.RESTAURANT,
  fetchHtml: typeof fetchPublicHtml = fetchPublicHtml,
): Promise<HomepageSignals> {
  const empty = emptyHomepageSignals();
  try {
    const url = new URL(rawUrl);
    if (!isHttpUrl(url)) return empty;
  } catch {
    return empty;
  }

  try {
    const result = await fetchHtml(rawUrl, {
      userAgent: LEAD_DISCOVERY_USER_AGENT,
      timeoutMs: 8_000,
    });
    return parseHomepageSignals(
      result.html,
      result.finalUrl,
      result.lastModifiedAt,
      vertical,
    );
  } catch {
    return empty;
  }
}

export function parseHomepageSignals(
  html: string,
  finalUrl: URL,
  lastModifiedHeader: string | null = null,
  vertical: VerticalId = Vertical.RESTAURANT,
): HomepageSignals {
  const adapter = resolveLeadDiscoveryAdapter(vertical);
  const viewport = metaContent(html, "viewport");
  const title =
    decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "") ||
    metaContent(html, "og:title");
  const metaDescription =
    metaContent(html, "description") || metaContent(html, "og:description");
  const pageText = stripMarkup(html).slice(0, MAX_PAGE_TEXT_CHARS);

  const hasCatalogHint = adapter.homepage.catalogPattern.test(
    html.slice(0, 250_000),
  );
  const hasConversionHint = adapter.homepage.conversionPattern.test(
    html.slice(0, 250_000),
  );
  const hasBusinessJsonLd = detectBusinessJsonLd(
    html,
    adapter.homepage.structuredDataTypes,
  );
  return {
    isFetched: true,
    finalUrl: finalUrl.toString(),
    isHttps: finalUrl.protocol === "https:",
    hasViewport: viewport.length > 0,
    isDesktopOnlyViewport: isDesktopOnlyViewport(viewport),
    hasDesktopOnlyMarkup:
      /<frameset\b/i.test(html) ||
      /shockwave-flash|application\/x-shockwave-flash/i.test(html),
    hasCatalogHint,
    hasConversionHint,
    hasBusinessJsonLd,
    hasMenuHint: hasCatalogHint,
    hasBookingHint: hasConversionHint,
    hasTitle: title.length > 0,
    hasMetaDescription: metaDescription.length > 0,
    hasRestaurantJsonLd: hasBusinessJsonLd,
    scriptCount: (html.match(/<script\b/gi) ?? []).length,
    htmlBytes: new TextEncoder().encode(html).length,
    lastModifiedAt: lastModifiedHeader,
    title,
    metaDescription,
    pageText,
  };
}

function emptyHomepageSignals(): HomepageSignals {
  return {
    isFetched: false,
    finalUrl: null,
    isHttps: false,
    hasViewport: false,
    isDesktopOnlyViewport: false,
    hasDesktopOnlyMarkup: false,
    hasCatalogHint: false,
    hasConversionHint: false,
    hasBusinessJsonLd: false,
    hasMenuHint: false,
    hasBookingHint: false,
    hasTitle: false,
    hasMetaDescription: false,
    hasRestaurantJsonLd: false,
    scriptCount: 0,
    htmlBytes: 0,
    lastModifiedAt: null,
    title: "",
    metaDescription: "",
    pageText: "",
  };
}

function normalizeOptionalWebsite(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    );
    if (!isHttpUrl(url)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isHttpUrl(url: URL): boolean {
  return (
    ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
  );
}

function isDesktopOnlyViewport(content: string): boolean {
  if (!content) return false;
  if (/width\s*=\s*device-width/i.test(content)) return false;
  const width = content.match(/width\s*=\s*(\d+)/i)?.[1];
  return width ? Number(width) >= 980 : false;
}

function detectBusinessJsonLd(html: string, typePattern: RegExp): boolean {
  const scriptPattern =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      if (jsonLdHasBusinessType(JSON.parse(raw), typePattern)) return true;
    } catch {
      // Homepage JSON-LD is often invalid; a parse failure is not evidence.
    }
  }
  return false;
}

function jsonLdHasBusinessType(value: unknown, typePattern: RegExp): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => jsonLdHasBusinessType(entry, typePattern));
  }
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (jsonLdHasBusinessType(record["@graph"], typePattern)) return true;
  const type = record["@type"];
  const types = Array.isArray(type) ? type : [type];
  return types.some(
    (entry) => typeof entry === "string" && typePattern.test(entry),
  );
}

function isStaleLastModified(value: string | null): boolean {
  if (!value) return false;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  return Date.now() - parsed > 2 * 365 * 24 * 60 * 60 * 1000;
}

function clampScore(score: number, reasons: string[]): SiteQualityScore {
  return {
    score: Math.min(100, Math.max(0, score)),
    reasons,
  };
}

function metaContent(html: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
      "i",
    ),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }
  return "";
}

function decodeHtml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/\s+/g, " ")
    .trim();
}

function stripMarkup(html: string): string {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
}
