import { z } from "zod";
import type { HomepageSignals } from "@/lib/lead-discovery";

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
          "The listing has no specific restaurant category. Set a primary category such as restaurant or the actual cuisine.",
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
      id: "menu",
      label: "Menu link is findable",
      weight: 10,
      isPassed: Boolean(homepage?.hasMenuHint),
      passDetail: "A menu or carte link is present on the homepage.",
      failFix: {
        title: "Add a visible menu link",
        detail:
          "The homepage does not expose a menu/carte link. Google and diners both look for one above the fold.",
      },
    }),
    check({
      id: "booking",
      label: "Booking or reservation link is findable",
      weight: 10,
      isPassed: Boolean(homepage?.hasBookingHint),
      passDetail: "A booking or reservation path is present on the homepage.",
      failFix: {
        title: "Add a reservation or booking link",
        detail:
          "No booking provider or reservation link was found. Keep the existing OpenTable/TheFork/phone flow, but link it from the homepage.",
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
            ? "The listing has no photos. Add current interior, exterior, and plate photos from the last 90 days."
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
            : `Only ${input.reviewCount} Google reviews were found. Ask recent diners for a genuine review; do not buy ratings.`,
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
      label: "Restaurant or LocalBusiness JSON-LD is present",
      weight: 8,
      isPassed: Boolean(homepage?.hasRestaurantJsonLd),
      passDetail: "Homepage JSON-LD includes Restaurant or LocalBusiness.",
      failFix: {
        title: "Add Restaurant structured data",
        detail:
          "The homepage does not declare Restaurant/LocalBusiness JSON-LD with hours, menu, or booking URLs.",
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
          ? "The homepage is not HTTPS. Browsers and Google both warn on plaintext restaurant sites."
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
  name: string;
  previewUrl: string;
  audit: LocalSeoAuditResult;
}): LocalSeoOutreachEmail {
  const name = input.name.trim() || "your restaurant";
  const fixes = input.audit.topFixes.slice(0, 5);
  const lines = [
    `I looked at how ${name} shows up on Google. These are the gaps on the public listing and homepage:`,
    "",
    ...fixes.map(
      (fix, index) => `${index + 1}. ${fix.title} — ${fix.detail}`,
    ),
    "",
    `I built a mobile-first preview that already covers the on-site items this audit can fix (HTTPS, mobile viewport, Restaurant markup): ${input.previewUrl}`,
    "",
    "This is a checklist from public data, not a ranking guarantee and not an award.",
  ];

  return {
    subject: `5 things holding back ${name} on Google`,
    text: lines.join("\n"),
  };
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
