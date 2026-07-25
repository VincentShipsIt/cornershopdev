import { isIP } from "node:net";
import { resolve4, resolve6 } from "node:dns/promises";
import { z } from "zod";
import type {
  LinkClassificationHint,
  ProviderDefinition,
  VerticalConfig,
} from "@/lib/verticals/types";

type ImporterVerticalConfig = Pick<VerticalConfig, "providers" | "crawl">;

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
  type: "booking" | "ordering" | "delivery" | "social";
  provider: string | null;
};

export type ExtractedSite = {
  source: string;
  sourceUrl: string | null;
  sourceLocale: string | null;
  name: string;
  description: string;
  address: string;
  phone: string;
  heroImageUrl: string | null;
  pageText: string;
  links: ExtractedLink[];
};

export type ExtractedRestaurant = ExtractedSite;

const privateIpv4Patterns = [
  /^0\./,
  /^10\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.0\.0\./,
  /^192\.0\.2\./,
  /^192\.168\./,
  /^198\.(1[89])\./,
  /^198\.51\.100\./,
  /^203\.0\.113\./,
  /^2(2[4-9]|3\d)\./,
  /^2[4-5]\d\./,
];

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  if (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("::") ||
    normalized.startsWith("::ffff:") ||
    normalized.startsWith("64:ff9b:") ||
    normalized.startsWith("2001:db8:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("ff")
  ) {
    return true;
  }
  if (normalized.startsWith("fe80:")) return true;
  return privateIpv4Patterns.some((pattern) => pattern.test(address));
}

async function assertPublicUrl(url: URL): Promise<void> {
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http and https URLs are supported");
  }

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new Error("Local network addresses are not supported");
  }

  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new Error("Private network addresses are not supported");
    }
    return;
  }

  const addresses = (
    await Promise.allSettled([resolve4(hostname), resolve6(hostname)])
  ).flatMap((result) => (result.status === "fulfilled" ? result.value : []));

  if (addresses.length === 0) {
    throw new Error("The restaurant website could not be resolved");
  }

  if (addresses.some(isPrivateAddress)) {
    throw new Error("Private network addresses are not supported");
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
      throw new Error("The restaurant website is too large to import safely");
    }
    html += decoder.decode(value, { stream: true });
  }

  return html + decoder.decode();
}

async function fetchHtml(initialUrl: URL): Promise<{
  html: string;
  finalUrl: URL;
}> {
  let url = initialUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    await assertPublicUrl(url);
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          "Cornershopdev Importer/1.0 (+https://cornershop.dev; restaurant preview builder)",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("The website returned an invalid redirect");
      url = new URL(location, url);
      continue;
    }

    if (!response.ok) {
      throw new Error(`The restaurant website returned HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      throw new Error("The supplied URL is not an HTML website");
    }

    return { html: await readLimitedBody(response), finalUrl: url };
  }

  throw new Error("The restaurant website redirected too many times");
}

export async function fetchPublicImage(rawUrl: string): Promise<{
  data: Uint8Array;
  mediaType: string;
}> {
  let url = new URL(rawUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    await assertPublicUrl(url);
    const response = await fetch(url, {
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg",
        "User-Agent":
          "Cornershopdev Image Importer/1.0 (+https://cornershop.dev; authentic restaurant photo enhancement)",
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

function extractTitle(html: string): string {
  return (
    metaContent(html, "og:site_name") ||
    metaContent(html, "og:title") ||
    decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "")
      .split(/[|–—]/)[0]
      .trim()
  );
}

function extractDocumentLocale(html: string): string | null {
  const locale =
    html.match(/<html[^>]+lang=["']([^"']+)["']/i)?.[1] ??
    metaContent(html, "content-language");
  const normalized = locale?.trim().replace("_", "-");
  return normalized && /^[a-z]{2}(?:-[A-Z]{2})?$/i.test(normalized)
    ? normalized.split("-")[0].toLowerCase()
    : null;
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

function extractLinks(
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

function extractContact(pageText: string): { address: string; phone: string } {
  const phone =
    pageText.match(
      /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,4}\d{2,4}/,
    )?.[0] ?? "";
  return { address: "", phone };
}

export async function inspectSource(
  rawSource: string,
  vertical: ImporterVerticalConfig,
): Promise<ExtractedSite> {
  const source = sourceSchema.parse(rawSource);
  const looksLikeUrl =
    /^(?:https?:\/\/|www\.)/i.test(source) ||
    bareDomainPattern.test(source);

  if (!looksLikeUrl) {
    return {
      source,
      sourceUrl: null,
      sourceLocale: null,
      name: source,
      description: "",
      address: "",
      phone: "",
      heroImageUrl: null,
      pageText: source,
      links: [],
    };
  }

  const normalized = /^https?:\/\//i.test(source) ? source : `https://${source}`;
  const { html, finalUrl } = await fetchHtml(new URL(normalized));
  const contentPages = await Promise.allSettled(
    extractInternalContentUrls(
      html,
      finalUrl,
      vertical.crawl.relevantPathPattern,
    ).map(async (url) => {
      const result = await fetchHtml(url);
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
    ...discoveredPages.map(
      (page) => `Page ${page.url.pathname}: ${page.text}`,
    ),
  ]
    .join("\n\n")
    .slice(0, MAX_SOURCE_TEXT_CHARS);
  const contact = extractContact(pageText);
  const hero = metaContent(html, "og:image");
  const links = [html, ...discoveredPages.map((page) => page.html)]
    .flatMap((pageHtml) =>
      extractLinks(
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

  return {
    source,
    sourceUrl: finalUrl.toString(),
    sourceLocale: extractDocumentLocale(html),
    name: extractTitle(html) || finalUrl.hostname.replace(/^www\./, ""),
    description:
      metaContent(html, "og:description") ||
      metaContent(html, "description"),
    address: contact.address,
    phone: contact.phone,
    heroImageUrl: hero ? new URL(hero, finalUrl).toString() : null,
    pageText,
    links,
  };
}
