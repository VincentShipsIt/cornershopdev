import type { Metadata } from "next";
import { isFactoryHostname } from "@/lib/hostnames";
import { requestHostname } from "@/lib/request-hostname";
import type { SitePaletteView } from "@/lib/site-draft";

export type PreviewMetadataDraft = {
  name: string;
  description: string;
  slug: string;
  defaultLocale: string;
};

export type PreviewMetadataOptions = {
  isLiveSurface: boolean;
  locale?: string;
  locales: string[];
  /**
   * Verified customer hostname from the incoming live request (proxy-attested).
   * Platform subdomains are a separate issue; this never invents one.
   */
  verifiedHostname: string | null;
  factoryOrigin: string;
  factoryName: string;
};

export type PreviewOgDraft = {
  name: string;
  description: string;
  eyebrow: string;
  heroImageUrl: string | null;
  palette: SitePaletteView;
};

export type LivePreviewOgCard = {
  kind: "live";
  name: string;
  tagline: string;
  initials: string;
  heroImageUrl: string | null;
  palette: SitePaletteView;
};

export type UnpublishedPreviewOgCard = {
  kind: "unpublished";
  name: string;
};

export type PreviewOgCard = LivePreviewOgCard | UnpublishedPreviewOgCard;

const PRIVATE_PREVIEW_SUFFIX = "Private preview";

/**
 * Customer-site metadata. Nested `openGraph` / `twitter` objects merge
 * shallowly with the root layout, so both are restated in full — otherwise
 * `/preview/[slug]` and every customer host rewritten to it inherit the
 * factory Cornershopdev card.
 */
export function previewMetadata(
  site: PreviewMetadataDraft,
  options: PreviewMetadataOptions,
): Metadata {
  const title = options.isLiveSurface
    ? site.name
    : `${site.name} — ${PRIVATE_PREVIEW_SUFFIX}`;
  const description = site.description.trim() || site.name;
  const metadataBase = new URL(
    liveCustomerOrigin(options.verifiedHostname, options.isLiveSurface) ??
      options.factoryOrigin,
  );
  const canonicalPath = previewCanonicalPath(site, options);
  const canonicalUrl = new URL(canonicalPath, metadataBase).href;
  const siteName = options.isLiveSurface ? site.name : options.factoryName;

  return {
    // Absolute so the root "| Cornershopdev" template stays off a live
    // restaurant tab and off the private-preview title string.
    title: { absolute: title },
    description,
    metadataBase,
    robots: options.isLiveSurface
      ? { index: true, follow: true }
      : { index: false, follow: false },
    alternates: {
      canonical: canonicalPath,
      languages: Object.fromEntries(
        options.locales.map((locale) => [
          locale,
          previewCanonicalPath(site, { ...options, locale }),
        ]),
      ),
    },
    openGraph: {
      title,
      description,
      siteName,
      type: "website",
      url: canonicalUrl,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export function previewOgCard(
  site: PreviewOgDraft,
  options: { isLiveSurface: boolean },
): PreviewOgCard {
  if (!options.isLiveSurface) {
    return { kind: "unpublished", name: site.name };
  }

  const heroImageUrl = site.heroImageUrl?.trim() || null;
  return {
    kind: "live",
    name: site.name,
    tagline: previewTagline(site),
    initials: businessInitials(site.name),
    heroImageUrl,
    palette: site.palette,
  };
}

export function factoryMetadataOrigin(
  configured: string | undefined = process.env.NEXT_PUBLIC_APP_URL,
): string {
  try {
    return new URL(configured ?? "https://cornershop.dev").origin;
  } catch {
    return "https://cornershop.dev";
  }
}

/**
 * Hostname a live customer request actually arrived on. Factory and niche
 * marketing hosts never count — those are not a restaurant's own domain.
 */
export function customerHostname(
  headers: Pick<Headers, "get">,
): string | null {
  const hostname = requestHostname(headers);
  if (!hostname || isFactoryHostname(hostname)) return null;
  return hostname;
}

export function businessInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0]?.[0];
    const second = parts[1]?.[0];
    if (first && second) return `${first}${second}`.toUpperCase();
  }
  const compact = parts[0] ?? "";
  const initials = compact.slice(0, 2).toUpperCase();
  return initials || "?";
}

function liveCustomerOrigin(
  verifiedHostname: string | null,
  isLiveSurface: boolean,
): string | null {
  if (!isLiveSurface) return null;
  const hostname = verifiedHostname?.trim().toLowerCase();
  if (!hostname || isFactoryHostname(hostname)) return null;
  return `https://${hostname}`;
}

function previewCanonicalPath(
  site: PreviewMetadataDraft,
  options: Pick<
    PreviewMetadataOptions,
    "isLiveSurface" | "locale" | "verifiedHostname"
  >,
): string {
  const locale = options.locale ?? site.defaultLocale;
  const isDefaultLocale = locale === site.defaultLocale;
  if (liveCustomerOrigin(options.verifiedHostname, options.isLiveSurface)) {
    return isDefaultLocale ? "/" : `/${locale}`;
  }

  return isDefaultLocale
    ? `/preview/${site.slug}`
    : `/preview/${site.slug}/${locale}`;
}

function previewTagline(site: PreviewOgDraft): string {
  const eyebrow = site.eyebrow.trim();
  if (eyebrow) return eyebrow;
  const description = site.description.trim();
  if (description.length <= 160) return description;
  return `${description.slice(0, 157).trimEnd()}…`;
}
