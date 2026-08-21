import { BlockList, isIP } from "node:net";
import { resolve4, resolve6 } from "node:dns/promises";
import { Agent, fetch as undiciFetch } from "undici";
import { z } from "zod";
import {
  reconstructSource,
  type AccessiblePalette,
  type ExtractedBrandAsset,
  type ExtractedCatalogSection,
  type ExtractedNavigationLink,
  type ReconstructionEvidence,
} from "@/lib/source-reconstruction";
import type {
  IntegrationLinkType,
  LinkClassificationHint,
  ProviderDefinition,
  VerticalConfig,
} from "@/lib/verticals/types";

type ImporterVerticalConfig = Pick<
  VerticalConfig,
  "providers" | "crawl" | "presentation"
>;

const MAX_HTML_BYTES = 1_500_000;
const MAX_IMAGE_BYTES = 12_000_000;
const MAX_REDIRECTS = 3;
const MAX_DISCOVERY_PAGES = 6;
const MAX_SOURCE_TEXT_CHARS = 60_000;

const sourceSchema = z.string().trim().min(2).max(500);
const bareDomainPattern =
  /^(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\.)+[a-z]{2,63}(?::\d{1,5})?(?:[/?#][^\s]*)?$/i;

export type ExtractedLink = {
  label: string;
  url: string;
  type: IntegrationLinkType;
  provider: string | null;
};

export type ExtractedSite = {
  source: string;
  sourceUrl: string | null;
  businessTypes?: string[];
  sourceLocale: string | null;
  name: string;
  description: string;
  address: string;
  phone: string;
  email?: string;
  businessHours?: Array<{ days: string; hours: string }>;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  heroImageUrl: string | null;
  palette?: AccessiblePalette | null;
  navigation?: ExtractedNavigationLink[];
  catalogSections?: ExtractedCatalogSection[];
  brandAssets?: ExtractedBrandAsset[];
  evidence?: ReconstructionEvidence[];
  pageText: string;
  links: ExtractedLink[];
};

export type ExtractedRestaurant = ExtractedSite;

const privateNets = new BlockList();
privateNets.addSubnet("0.0.0.0", 8, "ipv4");
privateNets.addSubnet("10.0.0.0", 8, "ipv4");
privateNets.addSubnet("100.64.0.0", 10, "ipv4");
privateNets.addSubnet("127.0.0.0", 8, "ipv4");
privateNets.addSubnet("169.254.0.0", 16, "ipv4");
privateNets.addSubnet("172.16.0.0", 12, "ipv4");
privateNets.addSubnet("192.0.0.0", 24, "ipv4");
privateNets.addSubnet("192.0.2.0", 24, "ipv4");
privateNets.addSubnet("192.168.0.0", 16, "ipv4");
privateNets.addSubnet("198.18.0.0", 15, "ipv4");
privateNets.addSubnet("198.51.100.0", 24, "ipv4");
privateNets.addSubnet("203.0.113.0", 24, "ipv4");
privateNets.addSubnet("224.0.0.0", 4, "ipv4");
privateNets.addSubnet("240.0.0.0", 4, "ipv4");
privateNets.addAddress("::", "ipv6");
privateNets.addSubnet("::1", 128, "ipv6");
privateNets.addSubnet("fc00::", 7, "ipv6");
privateNets.addSubnet("fe80::", 10, "ipv6");
privateNets.addSubnet("ff00::", 8, "ipv6");
privateNets.addSubnet("2001:db8::", 32, "ipv6");

function hexPairToIpv4(high: string, low: string): string {
  const hi = Number.parseInt(high, 16);
  const lo = Number.parseInt(low, 16);
  return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
}

/**
 * IPv4-mapped (::ffff:a.b.c.d), IPv4-compatible (::a.b.c.d / ::7f00:1),
 * and well-known NAT64 (64:ff9b::/96) embed an IPv4 address in the last
 * 32 bits. Prefix string checks miss those forms.
 */
function embeddedIpv4(address: string): string | null {
  if (address === "::" || address === "::1") return null;
  const dotted = address.match(
    /^(?:::(?:ffff:)?|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/i,
  );
  if (dotted?.[1]) return dotted[1];
  const hex = address.match(
    /^(?:::(?:ffff:)?|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i,
  );
  if (hex?.[1] && hex[2]) return hexPairToIpv4(hex[1], hex[2]);
  return null;
}

/** Exported for unit tests and shared private-host checks. */
export function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  const embedded = embeddedIpv4(normalized);
  if (embedded && isPrivateAddress(embedded)) return true;
  const family = isIP(normalized);
  if (family === 4) return privateNets.check(normalized, "ipv4");
  if (family === 6) return privateNets.check(normalized, "ipv6");
  return false;
}

function normalizeHostname(hostname: string): string {
  // WHATWG URL keeps brackets on IPv6 hostnames (`[::1]`); strip them before
  // IP classification so link-local and loopback literals are not sent to DNS.
  return hostname.toLowerCase().replace(/^\[|\]$/g, "");
}

/**
 * Resolves A/AAAA records and rejects the host if any answer is private.
 * Returns the public addresses so the connect path can pin to one of them.
 */
export async function resolvePublicAddresses(
  hostname: string,
): Promise<string[]> {
  const normalized = normalizeHostname(hostname);
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized === "metadata.google.internal"
  ) {
    throw new Error("Local network addresses are not supported");
  }

  if (isIP(normalized)) {
    if (isPrivateAddress(normalized)) {
      throw new Error("Private network addresses are not supported");
    }
    return [normalized];
  }

  const addresses = (
    await Promise.allSettled([resolve4(normalized), resolve6(normalized)])
  ).flatMap((result) => (result.status === "fulfilled" ? result.value : []));

  if (addresses.length === 0) {
    throw new Error("The website could not be resolved");
  }

  if (addresses.some(isPrivateAddress)) {
    throw new Error("Private network addresses are not supported");
  }
  return addresses;
}

/**
 * Resolves and rejects private / link-local / metadata destinations before the
 * importer opens a connection.
 */
export async function assertPublicUrl(url: URL): Promise<void> {
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http and https URLs are supported");
  }
  await resolvePublicAddresses(url.hostname);
}

/**
 * Connects to a public IP that was resolved for this hostname, with SNI/Host
 * still set to the original name. That closes the classic DNS-rebinding window
 * between resolve and TCP connect (the OS resolver is not consulted again).
 */
async function fetchPublicResponse(
  url: URL,
  init: RequestInit,
): Promise<Response> {
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http and https URLs are supported");
  }

  const hostname = normalizeHostname(url.hostname);
  const addresses = await resolvePublicAddresses(hostname);
  // Prefer IPv4 when available; many independent-business origins still lack AAAA.
  const pinnedIp =
    addresses.find((address) => isIP(address) === 4) ?? addresses[0];
  const family = isIP(pinnedIp) === 6 ? 6 : 4;

  const agent = new Agent({
    connect: {
      lookup(_host, _options, callback) {
        callback(null, pinnedIp, family);
      },
      servername: hostname,
    },
  });

  try {
    const headers = new Headers(init.headers);
    if (!headers.has("host")) {
      headers.set(
        "host",
        url.port && url.port !== "80" && url.port !== "443"
          ? `${hostname}:${url.port}`
          : hostname,
      );
    }
    // undici's RequestInit/Response types diverge slightly from DOM fetch;
    // cast at the boundary — runtime behaviour matches for status/body reads.
    const response = (await undiciFetch(url, {
      method: init.method,
      headers,
      body: init.body as never,
      redirect: init.redirect ?? "manual",
      signal: init.signal as never,
      dispatcher: agent,
    })) as unknown as Response;
    // close() waits for in-flight body reads. destroy() would abort them.
    const closer = agent as { close?: () => void };
    try {
      closer.close?.();
    } catch {
      // Best-effort; short-lived agents are GC'd with the request.
    }
    return response;
  } catch (error) {
    const closer = agent as { destroy?: () => void; close?: () => void };
    try {
      closer.destroy?.();
      closer.close?.();
    } catch {
      // Best-effort; the connect failed so there is no body to preserve.
    }
    throw error;
  }
}

async function readLimitedBody(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let html = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new Error("The business website is too large to import safely");
    }
    html += decoder.decode(value, { stream: true });
  }

  return html + decoder.decode();
}

export async function fetchPublicHtml(
  rawUrl: string | URL,
  options: { userAgent?: string; timeoutMs?: number } = {},
): Promise<{
  html: string;
  finalUrl: URL;
  lastModifiedAt: string | null;
}> {
  let url = typeof rawUrl === "string" ? new URL(rawUrl) : rawUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    const response = await fetchPublicResponse(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          options.userAgent ??
          "Cornershopdev Importer/1.0 (+https://cornershop.dev; local business preview builder)",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location)
        throw new Error("The website returned an invalid redirect");
      url = new URL(location, url);
      continue;
    }

    if (!response.ok) {
      throw new Error(`The website returned HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      throw new Error("The supplied URL is not an HTML website");
    }

    return {
      html: await readLimitedBody(response),
      finalUrl: url,
      lastModifiedAt: response.headers.get("last-modified"),
    };
  }

  throw new Error("The website redirected too many times");
}

export async function fetchPublicImage(rawUrl: string): Promise<{
  data: Uint8Array;
  mediaType: string;
}> {
  let url = new URL(rawUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    const response = await fetchPublicResponse(url, {
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg",
        "User-Agent":
          "Cornershopdev Image Importer/1.0 (+https://cornershop.dev; provenance-preserving business photo enhancement)",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("The image returned an invalid redirect");
      url = new URL(location, url);
      continue;
    }

    if (!response.ok) {
      throw new Error(`The source image returned HTTP ${response.status}`);
    }

    const mediaType = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (
      !["image/avif", "image/jpeg", "image/png", "image/webp"].includes(
        mediaType,
      )
    ) {
      throw new Error("The source must be a JPEG, PNG, WebP, or AVIF image");
    }
    if (!response.body) throw new Error("The source image was empty");

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_IMAGE_BYTES) {
        await reader.cancel();
        throw new Error("The source image is too large to import safely");
      }
      chunks.push(value);
    }

    const data = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { data, mediaType };
  }

  throw new Error("The source image redirected too many times");
}

/**
 * Re-validates a known integration URL through the same SSRF and redirect
 * boundary as source imports. Monitoring records only status/final URL; it
 * never downloads third-party response bodies or follows private redirects.
 */
export async function inspectPublicLink(rawUrl: string): Promise<{
  originalUrl: string;
  finalUrl: string;
  status: number;
}> {
  const originalUrl = new URL(rawUrl).toString();
  let url = new URL(originalUrl);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    const response = await fetchPublicResponse(url, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "User-Agent":
          "Cornershopdev Monitor/1.0 (+https://cornershop.dev; source link check)",
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("The link returned an invalid redirect");
      url = new URL(location, url);
      continue;
    }
    return { originalUrl, finalUrl: url.toString(), status: response.status };
  }
  throw new Error("The link redirected too many times");
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
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  ).slice(0, 32_000);
}

function detectProvider(
  url: string,
  providers: ProviderDefinition[],
): string | null {
  return providers.find(({ pattern }) => pattern.test(url))?.name ?? null;
}

function classifyLink(
  label: string,
  url: string,
  providers: ProviderDefinition[],
  hints: LinkClassificationHint[],
): ExtractedLink["type"] | null {
  const haystack = `${label} ${url}`.toLowerCase();
  const hintedType = hints.find(({ pattern }) => pattern.test(haystack))?.type;
  if (hintedType) return hintedType;
  return (
    providers.find(({ classificationPattern }) =>
      classificationPattern?.test(haystack),
    )?.type ?? null
  );
}

export function extractSourceLinks(
  html: string,
  baseUrl: URL,
  providers: ProviderDefinition[],
  hints: LinkClassificationHint[],
): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  const anchorPattern =
    /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(html)) !== null && links.length < 30) {
    try {
      const parsedUrl = new URL(decodeHtml(match[1]), baseUrl);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) continue;
      const url = parsedUrl.toString();
      const label = decodeHtml(match[2].replace(/<[^>]+>/g, " ")).slice(0, 80);
      const type = classifyLink(label, url, providers, hints);
      if (!type) continue;
      if (
        type === "social" &&
        /(?:sharer|share\.php|intent\/tweet)/i.test(url)
      ) {
        continue;
      }
      const provider = detectProvider(url, providers);
      if (links.some((link) => link.url === url)) continue;
      if (
        type === "social" &&
        provider &&
        links.some((link) => link.provider === provider)
      ) {
        continue;
      }
      links.push({
        type,
        label:
          label ||
          (type === "booking"
            ? "Book a table"
            : type === "quote"
              ? "Request a quote"
              : type === "contact"
                ? "Contact us"
                : type === "social"
                  ? "Follow us"
                  : "Order online"),
        provider,
        url,
      });
    } catch {
      // Ignore malformed links from the source website.
    }
  }

  return links;
}

function extractInternalContentUrls(
  html: string,
  baseUrl: URL,
  relevantPathPattern: RegExp,
): URL[] {
  const urls: URL[] = [];
  const anchorPattern = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;

  while (
    (match = anchorPattern.exec(html)) !== null &&
    urls.length < MAX_DISCOVERY_PAGES
  ) {
    try {
      const url = new URL(decodeHtml(match[1]), baseUrl);
      if (!["http:", "https:"].includes(url.protocol)) continue;
      url.hash = "";
      if (
        url.origin !== baseUrl.origin ||
        !relevantPathPattern.test(url.pathname)
      ) {
        continue;
      }
      if (url.pathname === baseUrl.pathname) continue;
      if (urls.some((candidate) => candidate.toString() === url.toString())) {
        continue;
      }
      urls.push(url);
    } catch {
      // Ignore malformed internal links.
    }
  }

  return urls;
}

export async function inspectSource(
  rawSource: string,
  vertical: ImporterVerticalConfig,
): Promise<ExtractedSite> {
  const source = sourceSchema.parse(rawSource);
  const looksLikeUrl =
    /^(?:https?:\/\/|www\.)/i.test(source) || bareDomainPattern.test(source);

  if (!looksLikeUrl) {
    return {
      source,
      sourceUrl: null,
      businessTypes: [],
      sourceLocale: null,
      name: source,
      description: "",
      address: "",
      phone: "",
      email: "",
      businessHours: [],
      logoUrl: null,
      faviconUrl: null,
      heroImageUrl: null,
      palette: null,
      navigation: [],
      catalogSections: [],
      brandAssets: [],
      evidence: [],
      pageText: source,
      links: [],
    };
  }

  const normalized = /^https?:\/\//i.test(source)
    ? source
    : `https://${source}`;
  const { html, finalUrl } = await fetchPublicHtml(new URL(normalized));
  const contentPages = await Promise.allSettled(
    extractInternalContentUrls(
      html,
      finalUrl,
      vertical.crawl.relevantPathPattern,
    ).map(async (url) => {
      const result = await fetchPublicHtml(url);
      if (result.finalUrl.origin !== finalUrl.origin) return null;
      return {
        html: result.html,
        url: result.finalUrl,
        text: stripMarkup(result.html),
      };
    }),
  );
  const discoveredPages = contentPages.flatMap((result) =>
    result.status === "fulfilled" && result.value ? [result.value] : [],
  );
  const pageText = [
    `Homepage: ${stripMarkup(html)}`,
    ...discoveredPages.map((page) => `Page ${page.url.pathname}: ${page.text}`),
  ]
    .join("\n\n")
    .slice(0, MAX_SOURCE_TEXT_CHARS);
  const links = [html, ...discoveredPages.map((page) => page.html)]
    .flatMap((pageHtml) =>
      extractSourceLinks(
        pageHtml,
        finalUrl,
        vertical.providers,
        vertical.crawl.linkKeywordHints,
      ),
    )
    .filter(
      (link, index, allLinks) =>
        allLinks.findIndex((candidate) => candidate.url === link.url) ===
          index &&
        (link.type !== "social" ||
          !link.provider ||
          allLinks.findIndex(
            (candidate) =>
              candidate.type === "social" &&
              candidate.provider === link.provider,
          ) === index),
    );

  const reconstructed = reconstructSource({
    homepage: { html, url: finalUrl },
    pages: discoveredPages.map((page) => ({ html: page.html, url: page.url })),
    fallbackName: finalUrl.hostname.replace(/^www\./, ""),
    links,
    fallbackPalette: {
      ...vertical.presentation.fallbackPalette,
      accentForeground: "#ffffff",
    },
  });

  return {
    source,
    sourceUrl: finalUrl.toString(),
    ...reconstructed,
    pageText,
    links,
  };
}
