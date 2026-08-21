import { z } from "zod";
import { Vertical } from "@/generated/prisma/enums";
import type { HomepageSignals } from "@/lib/lead-discovery";
import { resolveLeadDiscoveryAdapter } from "@/lib/lead-generation/registry";
import { resolveVerticalConfig } from "@/lib/verticals/registry";
import type { VerticalId } from "@/lib/verticals/types";

export const localSeoFixSchema = z.object({
  id: z.string().min(1).max(40),
  title: z.string().min(1).max(160),
  detail: z.string().min(1).max(400),
});

export const localSeoCheckSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(160),
  isPassed: z.boolean(),
  weight: z.number().int().min(1).max(20),
  detail: z.string().min(1).max(400),
  fix: localSeoFixSchema.nullable(),
});

export const localSeoAuditResultSchema = z.object({
  score: z.number().int().min(0).max(100),
  checks: z.array(localSeoCheckSchema).max(20),
  topFixes: z.array(localSeoFixSchema).max(5),
  auditedAt: z.string().trim().min(1),
});

export type LocalSeoFix = z.infer<typeof localSeoFixSchema>;
export type LocalSeoCheck = z.infer<typeof localSeoCheckSchema>;
export type LocalSeoAuditResult = z.infer<typeof localSeoAuditResultSchema>;

export type LocalSeoAuditInput = {
  vertical?: VerticalId;
  name: string;
  address: string | null;
  phone: string | null;
  city: string;
  websiteUrl: string | null;
  categories: string[];
  hours: Array<{ days: string; hours: string }>;
  photoCount: number;
  photoNewestAt: string | null;
  reviewCount: number | null;
  description: string | null;
  homepage: HomepageSignals | null;
};

export type LocalSeoOutreachEmail = {
  subject: string;
  text: string;
};

const PHOTO_STALE_MS = 90 * 24 * 60 * 60 * 1000;

export function auditLocalSeo(input: LocalSeoAuditInput): LocalSeoAuditResult {
  const vertical = input.vertical ?? Vertical.RESTAURANT;
  const adapter = resolveLeadDiscoveryAdapter(vertical);
  const homepage = input.homepage;
  const pageHaystack = `${homepage?.title ?? ""} ${homepage?.pageText ?? ""}`;
  const checks: LocalSeoCheck[] = [
    check({
      id: "nap",
      label: "Name, address and phone match the homepage",
      weight: 12,
      isPassed: hasConsistentNap(input, pageHaystack),
      passDetail: "The listing name, city/address, or phone appears on the homepage.",
      failFix: {
        title: "Make name, address and phone consistent",
        detail:
          "Google uses NAP consistency. Put the same public name, city, and phone on the homepage that appear on the listing.",
      },
    }),
    check({
      id: "categories",
      label: "Primary categories are set",
      weight: 8,
      isPassed: input.categories.length > 0,
      passDetail: `Categories: ${input.categories.slice(0, 4).join(", ") || "none"}.`,
      failFix: {
        title: "Add specific Google categories",
        detail:
          `The listing has no specific category for this vertical. Set a primary category such as ${adapter.audit.categoryExample}.`,
      },
    }),
    check({
      id: "hours",
      label: "Opening hours are published",
      weight: 10,
      isPassed: input.hours.length > 0,
      passDetail: "Hours are present on the listing.",
      failFix: {
        title: "Publish opening hours",
        detail:
          "Google has no hours for this business. Add weekly hours so maps and search can show when you are open.",
      },
    }),
    check({
      id: "catalog",
      label: `${sentenceCase(adapter.homepage.catalogLabel)} is findable`,
      weight: 10,
      isPassed: Boolean(homepage?.hasCatalogHint),
      passDetail: `A ${adapter.homepage.catalogLabel} link is present on the homepage.`,
      failFix: {
        title: `Add a visible ${adapter.homepage.catalogLabel} link`,
        detail:
          `The homepage does not expose a ${adapter.homepage.catalogLabel}. Google and ${adapter.audit.audienceNoun} both look for one above the fold.`,
      },
    }),
    check({
      id: "conversion",
      label: `${sentenceCase(adapter.homepage.conversionLabel)} link is findable`,
      weight: 10,
      isPassed: Boolean(homepage?.hasConversionHint),
      passDetail: `A ${adapter.homepage.conversionLabel} path is present on the homepage.`,
      failFix: {
        title: `Add a ${adapter.homepage.conversionLabel} link`,
        detail:
          `No ${adapter.homepage.conversionLabel} path was found. Preserve the business's existing provider or phone flow, but link it from the homepage.`,
      },
    }),
    check({
      id: "photos",
      label: "Recent listing photos",
      weight: 8,
      isPassed: hasAcceptablePhotos(input),
      passDetail: photoDetail(input),
      failFix: {
        title: "Upload recent Google photos",
        detail:
          input.photoCount === 0
            ? `The listing has no photos. Add current ${adapter.audit.photoSubjects} photos from the last 90 days.`
            : "The newest listing photo is older than 90 days. Add a current set so the profile does not look abandoned.",
      },
    }),
    check({
      id: "reviews",
      label: "Google reviews are present",
      weight: 8,
      isPassed: (input.reviewCount ?? 0) >= 5,
      passDetail:
        input.reviewCount === null
          ? "Review count was not provided by the source."
          : `${input.reviewCount} Google reviews are listed.`,
      failFix: {
        title: "Earn more than a handful of Google reviews",
        detail:
          input.reviewCount === null || input.reviewCount === 0
            ? "No Google review count was found. A thin profile loses local pack trust."
            : `Only ${input.reviewCount} Google reviews were found. Ask recent ${adapter.audit.audienceNoun} for a genuine review; do not buy ratings.`,
      },
    }),
    check({
      id: "description",
      label: "Business description is long enough",
      weight: 6,
      isPassed: descriptionLength(input) >= 80,
      passDetail: `Description length: ${descriptionLength(input)} characters.`,
      failFix: {
        title: "Write a fuller Google description",
        detail:
          "The listing or homepage description is under 80 characters. Google has little unique copy to match local searches.",
      },
    }),
    check({
      id: "title_meta",
      label: "Homepage title and meta description exist",
      weight: 8,
      isPassed: Boolean(homepage?.hasTitle && homepage.hasMetaDescription),
      passDetail: "Title and meta description are present.",
      failFix: {
        title: "Fix the homepage title and meta description",
        detail: homepage?.isFetched
          ? "The homepage is missing a title or meta description, so Google has to guess the snippet."
          : "The homepage could not be fetched, so title and meta could not be confirmed.",
      },
    }),
    check({
      id: "jsonld",
      label: `${adapter.homepage.structuredDataLabel} JSON-LD is present`,
      weight: 8,
      isPassed: Boolean(homepage?.hasBusinessJsonLd),
      passDetail: `Homepage JSON-LD includes ${adapter.homepage.structuredDataLabel}.`,
      failFix: {
        title: `Add ${adapter.homepage.structuredDataLabel} structured data`,
        detail:
          `The homepage does not declare ${adapter.homepage.structuredDataLabel} JSON-LD with hours, catalog, or conversion URLs.`,
      },
    }),
    check({
      id: "viewport",
      label: "Mobile viewport is set",
      weight: 6,
      isPassed: Boolean(
        homepage?.hasViewport && !homepage.isDesktopOnlyViewport,
      ),
      passDetail: "A mobile viewport is present.",
      failFix: {
        title: "Make the website usable on a phone",
        detail: homepage?.isDesktopOnlyViewport
          ? "The viewport is locked to a desktop width. Google treats that as a desktop-only site."
          : "The homepage has no mobile viewport meta tag.",
      },
    }),
    check({
      id: "https",
      label: "Homepage is served over HTTPS",
      weight: 6,
      isPassed: Boolean(homepage?.isHttps),
      passDetail: "The fetched homepage is HTTPS.",
      failFix: {
        title: "Serve the website over HTTPS",
        detail: input.websiteUrl
          ? "The homepage is not HTTPS. Browsers and Google both warn on plaintext business sites."
          : "No public website was listed, so HTTPS cannot be confirmed.",
      },
    }),
  ];

  const failedWeight = checks
    .filter((entry) => !entry.isPassed)
    .reduce((sum, entry) => sum + entry.weight, 0);
  const topFixes = checks
    .filter((entry) => !entry.isPassed && entry.fix)
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 5)
    .map((entry) => entry.fix)
    .filter((fix): fix is LocalSeoFix => fix !== null);

  return localSeoAuditResultSchema.parse({
    score: Math.min(100, Math.max(0, 100 - failedWeight)),
    checks,
    topFixes,
    auditedAt: new Date().toISOString(),
  });
}

export function renderLocalSeoOutreachEmail(input: {
  vertical?: VerticalId;
  name: string;
  previewUrl: string;
  audit: LocalSeoAuditResult;
}): LocalSeoOutreachEmail {
  const vertical = input.vertical ?? Vertical.RESTAURANT;
  const config = resolveVerticalConfig(vertical);
  const adapter = resolveLeadDiscoveryAdapter(vertical);
  const name = input.name.trim() || `your ${adapter.placeSearch.fallbackCategory.replaceAll("_", " ")}`;
  const fixes = input.audit.topFixes.slice(0, 5);
  const lines = [
    `I looked at how ${name} shows up on Google. These are the gaps on the public listing and homepage:`,
    "",
    ...fixes.map(
      (fix, index) => `${index + 1}. ${fix.title} — ${fix.detail}`,
    ),
    "",
    `I built a mobile-first preview that already covers the on-site items this audit can fix (HTTPS, mobile viewport, ${adapter.homepage.structuredDataLabel} markup): ${input.previewUrl}`,
    "",
    "This is a checklist from public data, not a ranking guarantee and not an award.",
  ];

  const findingCount = fixes.length;
  return {
    subject: `${findingCount} ${findingCount === 1 ? "thing" : "things"} ${config.marketing.brand.name} can improve for ${name} on Google`,
    text: lines.join("\n"),
  };
}

function sentenceCase(value: string): string {
  return value.replace(/^\w/, (character) => character.toUpperCase());
}

function check(input: {
  id: string;
  label: string;
  weight: number;
  isPassed: boolean;
  passDetail: string;
  failFix: { title: string; detail: string };
}): LocalSeoCheck {
  return {
    id: input.id,
    label: input.label,
    isPassed: input.isPassed,
    weight: input.weight,
    detail: input.isPassed ? input.passDetail : input.failFix.detail,
    fix: input.isPassed
      ? null
      : { id: input.id, title: input.failFix.title, detail: input.failFix.detail },
  };
}

function hasConsistentNap(input: LocalSeoAuditInput, pageHaystack: string): boolean {
  if (!pageHaystack.trim()) return false;
  const haystack = normalizeComparable(pageHaystack);
  const name = normalizeComparable(input.name);
  const city = normalizeComparable(input.city);
  const address = normalizeComparable(input.address ?? "");
  const phone = digitsOnly(input.phone);
  const pageDigits = digitsOnly(pageHaystack);

  const hasName = name.length >= 4 && haystack.includes(name);
  const hasPlace =
    (city.length >= 3 && haystack.includes(city)) ||
    (address.length >= 8 && haystack.includes(address.slice(0, 12)));
  const hasPhone = phone.length >= 8 && pageDigits.includes(phone.slice(-8));
  return hasName && (hasPlace || hasPhone);
}

function hasAcceptablePhotos(input: LocalSeoAuditInput): boolean {
  if (input.photoCount <= 0) return false;
  if (!input.photoNewestAt) return true;
  const parsed = Date.parse(input.photoNewestAt);
  if (!Number.isFinite(parsed)) return true;
  return Date.now() - parsed <= PHOTO_STALE_MS;
}

function photoDetail(input: LocalSeoAuditInput): string {
  if (input.photoCount <= 0) return "No listing photos.";
  if (!input.photoNewestAt) {
    return `${input.photoCount} photos are present; recency was not provided by the source.`;
  }
  return `${input.photoCount} photos; newest at ${input.photoNewestAt}.`;
}

function descriptionLength(input: LocalSeoAuditInput): number {
  const description =
    input.description?.trim() ||
    input.homepage?.metaDescription.trim() ||
    "";
  return description.length;
}

function normalizeComparable(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function digitsOnly(value: string | null): string {
  return (value ?? "").replace(/\D+/g, "");
}
