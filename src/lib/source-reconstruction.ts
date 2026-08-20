import { normalizeAccountEmail } from "@/lib/account-email";
import type { ExtractedLink } from "@/lib/importer";

const MAX_JSON_LD_BLOCKS = 24;
const MAX_JSON_LD_ENTITIES = 240;
const MAX_NAVIGATION_LINKS = 12;
const MAX_BRAND_ASSETS = 24;
const MAX_EVIDENCE_RECORDS = 80;
const MAX_CATALOG_SECTIONS = 12;
const MAX_CATALOG_ITEMS_PER_SECTION = 40;
const MAX_CATALOG_ITEMS_TOTAL = 120;

const supportedCurrencies = new Set([
  "EUR",
  "USD",
  "GBP",
  "CHF",
  "CAD",
  "AUD",
  "NZD",
  "JPY",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
]);

export type ReconstructionEvidenceMethod =
  | "json-ld"
  | "meta"
  | "html"
  | "link"
  | "css";

export type ReconstructionEvidence = {
  field: string;
  value: string;
  sourceUrl: string;
  method: ReconstructionEvidenceMethod;
  excerpt: string;
};

export type ExtractedBrandAsset = {
  type: "logo" | "favicon" | "hero" | "content";
  url: string;
  sourceUrl: string;
  provenance: "official";
  evidence: ReconstructionEvidenceMethod;
};

export type ExtractedNavigationLink = {
  label: string;
  url: string;
  destinationUrl: string | null;
};

export type ExtractedCatalogItem = {
  name: string;
  description: string;
  price: number | null;
  currency: string | null;
  availability: boolean | null;
  imageUrl: string | null;
};

export type ExtractedCatalogSection = {
  name: string;
  description: string;
  items: ExtractedCatalogItem[];
};

export type AccessiblePalette = {
  background: string;
  foreground: string;
  accent: string;
  accentForeground: string;
};

export type ReconstructedSource = {
  sourceLocale: string | null;
  name: string;
  description: string;
  address: string;
  phone: string;
  email: string;
  businessHours: Array<{ days: string; hours: string }>;
  logoUrl: string | null;
  faviconUrl: string | null;
  heroImageUrl: string | null;
  palette: AccessiblePalette | null;
  navigation: ExtractedNavigationLink[];
  catalogSections: ExtractedCatalogSection[];
  brandAssets: ExtractedBrandAsset[];
  evidence: ReconstructionEvidence[];
};

export type ReconstructedPage = {
  html: string;
  url: URL;
};

type JsonRecord = Record<string, unknown>;

type SourcedJsonRecord = {
  value: JsonRecord;
  sourceUrl: URL;
};

type Candidate = {
  value: string;
  method: ReconstructionEvidenceMethod;
  sourceUrl: string;
  excerpt: string;
};

type PaletteCandidates = {
  background?: Candidate;
  foreground?: Candidate;
  accent?: Candidate;
};

/**
 * Pure, bounded reconstruction over already-fetched public HTML. Network
 * safety stays in importer.ts; keeping evidence recovery pure makes malformed
 * and no-model behaviour deterministic and directly fixture-testable.
 */
export function reconstructSource(input: {
  homepage: ReconstructedPage;
  pages?: ReconstructedPage[];
  fallbackName: string;
  links: ExtractedLink[];
  fallbackPalette: AccessiblePalette;
}): ReconstructedSource {
  const pages = [input.homepage, ...(input.pages ?? [])];
  const homepageUrl = input.homepage.url;
  const evidence: ReconstructionEvidence[] = [];
  const brandAssets: ExtractedBrandAsset[] = [];
  const jsonEntities = pages
    .flatMap((page) =>
      extractJsonLd(page.html)
        .flatMap(flattenJsonEntities)
        .map((value) => ({ value, sourceUrl: page.url })),
    )
    .slice(0, MAX_JSON_LD_ENTITIES);
  const sourcedBusiness = selectBusinessEntity(jsonEntities, homepageUrl);
  const business = sourcedBusiness?.value ?? null;
  const businessSourceUrl = sourcedBusiness?.sourceUrl ?? homepageUrl;

  const name = firstCandidate([
    jsonStringCandidate(business?.name, "json-ld", businessSourceUrl, business),
    metaCandidate(input.homepage, "og:site_name"),
    metaCandidate(input.homepage, "application-name"),
    metaCandidate(input.homepage, "og:title"),
    elementCandidate(input.homepage, "h1"),
    titleCandidate(input.homepage),
  ]);
  const description = firstCandidate([
    jsonStringCandidate(
      business?.description,
      "json-ld",
      businessSourceUrl,
      business,
    ),
    metaCandidate(input.homepage, "og:description"),
    metaCandidate(input.homepage, "description"),
    firstParagraphCandidate(input.homepage),
  ]);
  const address = firstCandidate([
    jsonAddressCandidate(business?.address, businessSourceUrl, business),
    itemPropAddressCandidate(input.homepage),
    elementCandidate(input.homepage, "address"),
  ]);
  const phone = firstCandidate([
    jsonStringCandidate(
      business?.telephone,
      "json-ld",
      businessSourceUrl,
      business,
    ),
    contactLinkCandidate(pages, "tel:"),
    itemPropCandidate(input.homepage, "telephone"),
  ]);
  const email = firstCandidate([
    validEmailCandidate(
      jsonStringCandidate(
        business?.email,
        "json-ld",
        businessSourceUrl,
        business,
      ),
    ),
    emailLinkCandidate(pages),
    validEmailCandidate(itemPropCandidate(input.homepage, "email")),
  ]);
  const businessHours = extractBusinessHours(
    business,
    businessSourceUrl,
    pages,
    evidence,
  );

  addEvidence(evidence, "name", name);
  addEvidence(evidence, "description", description);
  addEvidence(evidence, "address", address);
  addEvidence(evidence, "phone", phone);
  addEvidence(evidence, "email", email);

  const jsonLogo = resolveAssetCandidate(
    assetValue(business?.logo),
    businessSourceUrl,
    "json-ld",
    business,
  );
  const htmlLogo = extractLogoCandidate(input.homepage);
  const favicon = extractFaviconCandidate(input.homepage);
  const jsonHero = resolveAssetCandidate(
    assetValue(business?.image),
    businessSourceUrl,
    "json-ld",
    business,
  );
  const hero = firstCandidate([
    metaAssetCandidate(input.homepage, "og:image"),
    metaAssetCandidate(input.homepage, "twitter:image"),
    jsonHero,
    extractHeroCandidate(input.homepage),
  ]);
  const logo = firstCandidate([jsonLogo, htmlLogo]);
  const icon = firstCandidate([favicon]);

  addAsset(brandAssets, "logo", logo);
  addAsset(brandAssets, "favicon", icon);
  addAsset(brandAssets, "hero", hero);
  for (const page of pages) {
    for (const asset of extractContentAssets(page)) {
      addAsset(brandAssets, "content", asset);
    }
  }
  addEvidence(evidence, "logoUrl", logo);
  addEvidence(evidence, "faviconUrl", icon);
  addEvidence(evidence, "heroImageUrl", hero);

  const paletteCandidates = extractPaletteCandidates(input.homepage);
  const hasSourcePalette = Boolean(
    paletteCandidates.background ??
      paletteCandidates.foreground ??
      paletteCandidates.accent,
  );
  const palette = hasSourcePalette
    ? repairPalette(
        {
          background: paletteCandidates.background?.value,
          foreground: paletteCandidates.foreground?.value,
          accent: paletteCandidates.accent?.value,
        },
        input.fallbackPalette,
      )
    : null;
  addEvidence(evidence, "palette.background", paletteCandidates.background);
  addEvidence(evidence, "palette.foreground", paletteCandidates.foreground);
  addEvidence(evidence, "palette.accent", paletteCandidates.accent);

  const catalogSections = extractCatalogSections(
    jsonEntities,
    pages,
    evidence,
    brandAssets,
  );

  return {
    sourceLocale: extractLocale(input.homepage, business),
    name: boundedText(name?.value || input.fallbackName, 120),
    description: boundedText(description?.value ?? "", 500),
    address: boundedText(address?.value ?? "", 220),
    phone: boundedText(normalizePhone(phone?.value ?? ""), 40),
    email: boundedText(normalizeEmail(email?.value ?? ""), 254),
    businessHours,
    logoUrl: logo?.value ?? null,
    faviconUrl: icon?.value ?? null,
    heroImageUrl: hero?.value ?? null,
    palette,
    navigation: extractNavigation(pages, homepageUrl),
    catalogSections,
    brandAssets,
    evidence: evidence.slice(0, MAX_EVIDENCE_RECORDS),
  };
}

export function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(parseColor(first) ?? { r: 0, g: 0, b: 0 });
  const b = relativeLuminance(parseColor(second) ?? { r: 0, g: 0, b: 0 });
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Repairs only accessibility, never fabricates another source colour. */
export function repairPalette(
  candidate: Partial<Omit<AccessiblePalette, "accentForeground">>,
  fallback: AccessiblePalette,
): AccessiblePalette {
  const background = normalizedColor(candidate.background) ?? fallback.background;
  let foreground = normalizedColor(candidate.foreground) ?? fallback.foreground;
  let accent = normalizedColor(candidate.accent) ?? fallback.accent;

  if (contrastRatio(background, foreground) < 4.5) {
    foreground = bestTextColor(background);
  }
  if (contrastRatio(background, accent) < 3) {
    const target = contrastRatio(background, "#000000") >= 3
      ? "#000000"
      : "#ffffff";
    accent = blendUntilContrast(accent, target, background, 3);
  }
  const accentForeground = bestTextColor(accent);
  return { background, foreground, accent, accentForeground };
}

/**
 * Asset URLs are rendered by the browser and re-validated by importer.ts before
 * any server-side image fetch. This synchronous boundary still rejects mixed
 * content, credentials, custom ports, and literal/local destinations.
 */
export function safeSourceAssetUrl(
  value: string,
  baseUrl: URL,
): string | null {
  try {
    const url = new URL(decodeHtml(value), baseUrl);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (url.port && url.port !== "443") return null;
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname === "metadata.google.internal" ||
      hostname.includes(":") ||
      isPrivateIpv4Literal(hostname)
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function extractJsonLd(html: string): unknown[] {
  const values: unknown[] = [];
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) && values.length < MAX_JSON_LD_BLOCKS) {
    const attributes = parseAttributes(match[1] ?? "");
    if ((attributes.type ?? "").toLowerCase() !== "application/ld+json") {
      continue;
    }
    const source = (match[2] ?? "")
      .replace(/^\s*<!--|-->\s*$/g, "")
      .replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, "")
      .trim();
    if (!source) continue;
    try {
      values.push(JSON.parse(source));
    } catch {
      // Malformed structured data is common; other deterministic signals remain.
    }
  }
  return values;
}

function flattenJsonEntities(value: unknown): JsonRecord[] {
  const entities: JsonRecord[] = [];
  const queue: unknown[] = [value];
  const seen = new Set<object>();
  while (queue.length > 0 && entities.length < MAX_JSON_LD_ENTITIES) {
    const current = queue.shift();
    if (Array.isArray(current)) {
      queue.push(...current.slice(0, MAX_JSON_LD_ENTITIES));
      continue;
    }
    if (!isRecord(current) || seen.has(current)) continue;
    seen.add(current);
    entities.push(current);
    queue.push(...Object.values(current));
  }
  return entities;
}

function selectBusinessEntity(
  entities: SourcedJsonRecord[],
  homepageUrl: URL,
): SourcedJsonRecord | null {
  const preferredTypes = new Set([
    "restaurant",
    "localbusiness",
    "beautysalon",
    "hairsalon",
    "nailsalon",
    "healthandbeautybusiness",
    "store",
    "organization",
  ]);
  return (
    entities
      .filter(({ value }) =>
        jsonTypes(value).some((type) => preferredTypes.has(type)),
      )
      .sort((left, right) =>
        businessScore(right, homepageUrl) - businessScore(left, homepageUrl),
      )[0] ?? null
  );
}

function businessScore(
  sourced: SourcedJsonRecord,
  homepageUrl: URL,
): number {
  const { value: entity, sourceUrl } = sourced;
  let score = typeof entity.name === "string" ? 5 : 0;
  if (entity.address) score += 3;
  if (entity.telephone) score += 2;
  if (entity.openingHours || entity.openingHoursSpecification) score += 2;
  if (entity.logo) score += 1;
  if (typeof entity.url === "string") {
    try {
      if (new URL(entity.url, sourceUrl).origin === homepageUrl.origin) {
        score += 2;
      }
    } catch {
      // Ignore malformed schema URLs.
    }
  }
  return score;
}

function jsonTypes(value: JsonRecord): string[] {
  const type = value["@type"];
  return (Array.isArray(type) ? type : [type]).flatMap((entry) =>
    typeof entry === "string" ? [entry.toLowerCase()] : [],
  );
}

function firstCandidate(values: Array<Candidate | null | undefined>): Candidate | null {
  return values.find((candidate) => Boolean(candidate?.value.trim())) ?? null;
}

function jsonStringCandidate(
  value: unknown,
  method: ReconstructionEvidenceMethod,
  sourceUrl: URL,
  record?: JsonRecord | null,
): Candidate | null {
  if (typeof value !== "string" || !cleanText(value)) return null;
  return candidate(cleanText(value), method, sourceUrl, record);
}

function jsonAddressCandidate(
  value: unknown,
  sourceUrl: URL,
  record?: JsonRecord | null,
): Candidate | null {
  if (typeof value === "string") {
    return jsonStringCandidate(value, "json-ld", sourceUrl, record);
  }
  if (!isRecord(value)) return null;
  const parts = [
    value.streetAddress,
    value.postalCode,
    value.addressLocality,
    value.addressRegion,
    value.addressCountry,
  ].flatMap((part) => (typeof part === "string" && cleanText(part) ? [cleanText(part)] : []));
  if (parts.length === 0) return null;
  return candidate(parts.join(", "), "json-ld", sourceUrl, value);
}

function metaCandidate(page: ReconstructedPage, key: string): Candidate | null {
  for (const tag of page.html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = parseAttributes(tag);
    const identity = (
      attributes.property ??
      attributes.name ??
      attributes["http-equiv"] ??
      ""
    ).toLowerCase();
    if (identity !== key.toLowerCase() || !attributes.content) continue;
    return candidate(cleanText(attributes.content), "meta", page.url, tag);
  }
  return null;
}

function metaAssetCandidate(
  page: ReconstructedPage,
  key: string,
): Candidate | null {
  const raw = metaCandidate(page, key);
  if (!raw) return null;
  const url = safeSourceAssetUrl(raw.value, page.url);
  return url ? { ...raw, value: url } : null;
}

function titleCandidate(page: ReconstructedPage): Candidate | null {
  const value = cleanText(page.html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "")
    .split(/[|–—]/)[0]
    ?.trim();
  return value ? candidate(value, "html", page.url, value) : null;
}

function elementCandidate(page: ReconstructedPage, tagName: string): Candidate | null {
  const escaped = tagName.replace(/[^a-z0-9-]/gi, "");
  const match = page.html.match(
    new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i"),
  );
  const value = cleanText(match?.[1] ?? "");
  return value ? candidate(value, "html", page.url, match?.[0] ?? value) : null;
}

function firstParagraphCandidate(page: ReconstructedPage): Candidate | null {
  for (const match of page.html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const value = cleanText(match[1] ?? "");
    if (
      value.length >= 20 &&
      !/(?:cookie|privacy|copyright|all rights reserved)/i.test(value)
    ) {
      return candidate(value, "html", page.url, match[0]);
    }
  }
  return null;
}

function itemPropCandidate(
  page: ReconstructedPage,
  property: string,
): Candidate | null {
  const escaped = property.replace(/[^a-z0-9-]/gi, "");
  const openingTag = page.html.match(
    new RegExp(`<[^>]+itemprop=["']${escaped}["'][^>]*>`, "i"),
  )?.[0];
  if (openingTag) {
    const attributes = parseAttributes(openingTag);
    const explicit = attributes.content ?? attributes.datetime;
    if (explicit && cleanText(explicit)) {
      return candidate(cleanText(explicit), "html", page.url, openingTag);
    }
  }
  const pattern = new RegExp(
    `<[^>]+itemprop=["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`,
    "i",
  );
  const match = page.html.match(pattern);
  const value = cleanText(match?.[1] ?? "");
  return value ? candidate(value, "html", page.url, match?.[0] ?? value) : null;
}

function itemPropAddressCandidate(page: ReconstructedPage): Candidate | null {
  const fields = [
    "streetAddress",
    "postalCode",
    "addressLocality",
    "addressRegion",
    "addressCountry",
  ];
  const values = fields.flatMap((field) => {
    const found = itemPropCandidate(page, field);
    return found ? [found.value] : [];
  });
  return values.length > 0
    ? candidate(values.join(", "), "html", page.url, values.join(", "))
    : null;
}

function contactLinkCandidate(
  pages: ReconstructedPage[],
  scheme: "tel:" | "mailto:",
): Candidate | null {
  for (const page of pages) {
    for (const tag of page.html.match(/<a\b[^>]*>/gi) ?? []) {
      const href = parseAttributes(tag).href;
      if (!href?.toLowerCase().startsWith(scheme)) continue;
      let value: string;
      try {
        value = decodeURIComponent(
          href.slice(scheme.length).split("?")[0] ?? "",
        );
      } catch {
        continue;
      }
      if (cleanText(value)) return candidate(value, "link", page.url, tag);
    }
  }
  return null;
}

function emailLinkCandidate(pages: ReconstructedPage[]): Candidate | null {
  for (const page of pages) {
    for (const tag of page.html.match(/<a\b[^>]*>/gi) ?? []) {
      const href = parseAttributes(tag).href;
      if (!href?.toLowerCase().startsWith("mailto:")) continue;
      const source = validEmailCandidate(candidate(href, "link", page.url, tag));
      if (source) return source;
    }
  }
  return null;
}

function extractBusinessHours(
  business: JsonRecord | null,
  sourceUrl: URL,
  pages: ReconstructedPage[],
  evidence: ReconstructionEvidence[],
): Array<{ days: string; hours: string }> {
  const rows: Array<{ days: string; hours: string }> = [];
  const specification = business?.openingHoursSpecification;
  for (const entry of Array.isArray(specification) ? specification : [specification]) {
    if (!isRecord(entry)) continue;
    const days = (Array.isArray(entry.dayOfWeek) ? entry.dayOfWeek : [entry.dayOfWeek])
      .flatMap((day) => typeof day === "string" ? [day.split("/").pop() ?? day] : [])
      .map(cleanText)
      .filter(Boolean)
      .join(", ");
    const opens = typeof entry.opens === "string" ? cleanText(entry.opens) : "";
    const closes = typeof entry.closes === "string" ? cleanText(entry.closes) : "";
    if (!days || !opens || !closes) continue;
    const row = { days: boundedText(days, 80), hours: `${opens}–${closes}` };
    if (!rows.some((existing) => existing.days === row.days && existing.hours === row.hours)) {
      rows.push(row);
      addEvidence(evidence, "businessHours", candidate(
        `${row.days}: ${row.hours}`,
        "json-ld",
        sourceUrl,
        entry,
      ));
    }
  }
  const openingHours = business?.openingHours;
  for (const entry of Array.isArray(openingHours) ? openingHours : [openingHours]) {
    if (typeof entry !== "string") continue;
    const normalized = cleanText(entry);
    const match = normalized.match(/^(.+?)\s+((?:[0-2]?\d(?::\d{2})?)[^\s]*\s*[-–]\s*(?:[0-2]?\d(?::\d{2})?)[^\s]*)$/);
    if (!match?.[1] || !match[2]) continue;
    const row = { days: boundedText(match[1], 80), hours: boundedText(match[2], 120) };
    if (!rows.some((existing) => existing.days === row.days && existing.hours === row.hours)) {
      rows.push(row);
      addEvidence(evidence, "businessHours", candidate(normalized, "json-ld", sourceUrl, business));
    }
  }
  for (const page of pages) {
    const opening = itemPropCandidate(page, "openingHours");
    if (!opening) continue;
    const match = opening.value.match(/^(.+?)\s+((?:[0-2]?\d(?::\d{2})?)[^\s]*\s*[-–]\s*(?:[0-2]?\d(?::\d{2})?)[^\s]*)$/);
    if (!match?.[1] || !match[2]) continue;
    const row = {
      days: boundedText(match[1], 80),
      hours: boundedText(match[2], 120),
    };
    if (!rows.some((existing) => existing.days === row.days && existing.hours === row.hours)) {
      rows.push(row);
      addEvidence(evidence, "businessHours", opening);
    }
  }
  return rows.slice(0, 14);
}

function assetValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(assetValue).find(Boolean) ?? null;
  }
  if (!isRecord(value)) return null;
  for (const key of ["url", "contentUrl", "@id"]) {
    if (typeof value[key] === "string") return value[key] as string;
  }
  return null;
}

function resolveAssetCandidate(
  value: string | null,
  sourceUrl: URL,
  method: ReconstructionEvidenceMethod,
  excerpt: unknown,
): Candidate | null {
  if (!value) return null;
  const url = safeSourceAssetUrl(value, sourceUrl);
  return url ? candidate(url, method, sourceUrl, excerpt) : null;
}

function extractLogoCandidate(page: ReconstructedPage): Candidate | null {
  for (const tag of page.html.match(/<img\b[^>]*>/gi) ?? []) {
    const attributes = parseAttributes(tag);
    const identity = `${attributes.alt ?? ""} ${attributes.class ?? ""} ${attributes.id ?? ""}`;
    if (!/(?:logo|brand|wordmark)/i.test(identity) || !attributes.src) continue;
    const url = safeSourceAssetUrl(attributes.src, page.url);
    if (url) return candidate(url, "html", page.url, tag);
  }
  return null;
}

function extractFaviconCandidate(page: ReconstructedPage): Candidate | null {
  for (const tag of page.html.match(/<link\b[^>]*>/gi) ?? []) {
    const attributes = parseAttributes(tag);
    if (!/(?:^|\s)(?:icon|shortcut icon|apple-touch-icon)(?:\s|$)/i.test(attributes.rel ?? "")) {
      continue;
    }
    if (!attributes.href) continue;
    const url = safeSourceAssetUrl(attributes.href, page.url);
    if (url) return candidate(url, "link", page.url, tag);
  }
  return null;
}

function extractHeroCandidate(page: ReconstructedPage): Candidate | null {
  for (const tag of page.html.match(/<img\b[^>]*>/gi) ?? []) {
    const attributes = parseAttributes(tag);
    const identity = `${attributes.alt ?? ""} ${attributes.class ?? ""} ${attributes.id ?? ""}`;
    if (!/(?:hero|banner|masthead|cover)/i.test(identity) || !attributes.src) continue;
    const url = safeSourceAssetUrl(attributes.src, page.url);
    if (url) return candidate(url, "html", page.url, tag);
  }
  return null;
}

function extractContentAssets(page: ReconstructedPage): Candidate[] {
  const assets: Candidate[] = [];
  for (const tag of page.html.match(/<img\b[^>]*>/gi) ?? []) {
    const attributes = parseAttributes(tag);
    if (!attributes.src) continue;
    const url = safeSourceAssetUrl(attributes.src, page.url);
    if (!url || /(?:pixel|tracker|spacer)/i.test(url)) continue;
    assets.push(candidate(url, "html", page.url, tag));
    if (assets.length >= 12) break;
  }
  return assets;
}

function addAsset(
  assets: ExtractedBrandAsset[],
  type: ExtractedBrandAsset["type"],
  source: Candidate | null,
): void {
  if (!source || assets.length >= MAX_BRAND_ASSETS) return;
  if (assets.some((asset) => asset.url === source.value)) return;
  assets.push({
    type,
    url: source.value,
    sourceUrl: source.sourceUrl,
    provenance: "official",
    evidence: source.method,
  });
}

function extractNavigation(
  pages: ReconstructedPage[],
  homepageUrl: URL,
): ExtractedNavigationLink[] {
  const links: ExtractedNavigationLink[] = [];
  for (const page of pages) {
    const navBlocks = page.html.match(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi) ?? [];
    for (const block of navBlocks) {
      for (const match of block.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
        const attributes = parseAttributes(match[1] ?? "");
        const label = boundedText(cleanText(match[2] ?? ""), 60);
        if (!label || !attributes.href) continue;
        try {
          const url = new URL(decodeHtml(attributes.href), page.url);
          if (
            !["http:", "https:"].includes(url.protocol) ||
            url.origin !== homepageUrl.origin
          ) {
            continue;
          }
          const href = `${url.pathname}${url.search}${url.hash}`;
          if (href.length > 2_048) continue;
          if (links.some((link) => link.url === href || link.label === label)) continue;
          links.push({
            label,
            url: href,
            destinationUrl:
              homepageUrl.protocol === "https:" ? url.toString() : null,
          });
          if (links.length >= MAX_NAVIGATION_LINKS) return links;
        } catch {
          // Malformed navigation does not invalidate other source evidence.
        }
      }
    }
  }
  return links;
}

function extractCatalogSections(
  entities: SourcedJsonRecord[],
  pages: ReconstructedPage[],
  evidence: ReconstructionEvidence[],
  brandAssets: ExtractedBrandAsset[],
): ExtractedCatalogSection[] {
  const sections: ExtractedCatalogSection[] = [];
  const assigned = new Set<JsonRecord>();

  for (const { value: entity, sourceUrl } of entities) {
    const types = jsonTypes(entity);
    if (!types.some((type) => ["menusection", "offercatalog", "itemlist"].includes(type))) continue;
    const children = [
      entity.hasMenuItem,
      entity.itemListElement,
      entity.itemOffered,
    ].flatMap(asJsonRecords);
    const items = children
      .map((child) => catalogItem(child, sourceUrl, evidence, brandAssets))
      .filter((item): item is ExtractedCatalogItem => Boolean(item))
      .slice(0, MAX_CATALOG_ITEMS_PER_SECTION);
    if (items.length === 0) continue;
    children.forEach((child) => {
      assigned.add(child);
      if (isRecord(child.itemOffered)) assigned.add(child.itemOffered);
    });
    sections.push({
      name: boundedText(stringValue(entity.name) || "Catalog", 80),
      description: boundedText(stringValue(entity.description), 240),
      items,
    });
    if (sections.length >= MAX_CATALOG_SECTIONS) break;
  }

  const standalone = entities
    .filter(({ value }) =>
      !assigned.has(value) &&
      jsonTypes(value).some((type) =>
        ["menuitem", "product", "service"].includes(type),
      ),
    )
    .map(({ value, sourceUrl }) =>
      catalogItem(value, sourceUrl, evidence, brandAssets),
    )
    .filter((item): item is ExtractedCatalogItem => Boolean(item));
  if (standalone.length > 0 && sections.length < MAX_CATALOG_SECTIONS) {
    sections.push({
      name: "Catalog",
      description: "",
      items: standalone.slice(0, MAX_CATALOG_ITEMS_PER_SECTION),
    });
  }

  const microdataItems = pages.flatMap((page) =>
    extractMicrodataCatalogItems(page, evidence, brandAssets),
  );
  const unseenMicrodataItems = microdataItems.filter(
    (item) =>
      !sections.some((section) =>
        section.items.some(
          (candidate) => candidate.name.toLowerCase() === item.name.toLowerCase(),
        ),
      ),
  );
  if (unseenMicrodataItems.length > 0 && sections.length < MAX_CATALOG_SECTIONS) {
    sections.push({
      name: "Catalog",
      description: "",
      items: unseenMicrodataItems.slice(0, MAX_CATALOG_ITEMS_PER_SECTION),
    });
  }

  let remaining = MAX_CATALOG_ITEMS_TOTAL;
  return sections.flatMap((section) => {
    if (remaining <= 0) return [];
    const uniqueItems = section.items.filter(
      (item, index, all) =>
        all.findIndex((candidate) => candidate.name.toLowerCase() === item.name.toLowerCase()) === index,
    ).slice(0, remaining);
    remaining -= uniqueItems.length;
    return uniqueItems.length > 0 ? [{ ...section, items: uniqueItems }] : [];
  });
}

function extractMicrodataCatalogItems(
  page: ReconstructedPage,
  evidence: ReconstructionEvidence[],
  brandAssets: ExtractedBrandAsset[],
): ExtractedCatalogItem[] {
  const items: ExtractedCatalogItem[] = [];
  const scopePattern = /<(article|li|div)\b([^>]*(?:itemscope|itemtype)[^>]*)>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = scopePattern.exec(page.html)) && items.length < MAX_CATALOG_ITEMS_PER_SECTION) {
    const scope = `${match[2] ?? ""} ${match[3] ?? ""}`;
    if (!/(?:schema\.org\/(?:MenuItem|Product|Service)|itemtype=["'][^"']*(?:MenuItem|Product|Service))/i.test(scope)) {
      continue;
    }
    const name = microdataProperty(match[0], "name");
    if (!name) continue;
    const description = microdataProperty(match[0], "description");
    const rawPrice = microdataProperty(match[0], "price");
    const rawCurrency = microdataProperty(match[0], "priceCurrency").toUpperCase();
    const parsedPrice = /^\d+(?:[.,]\d{1,2})?$/.test(rawPrice)
      ? Number(rawPrice.replace(",", "."))
      : null;
    const currency = supportedCurrencies.has(rawCurrency) ? rawCurrency : null;
    const rawImage = microdataProperty(match[0], "image");
    const availability = catalogAvailability(
      microdataProperty(match[0], "availability"),
    );
    const image = resolveAssetCandidate(rawImage || null, page.url, "html", match[0]);
    addAsset(brandAssets, "content", image);
    addEvidence(evidence, "catalog.item", candidate(name, "html", page.url, match[0]));
    if (availability !== null) {
      addEvidence(
        evidence,
        "catalog.availability",
        candidate(
          availability ? "in stock" : "unavailable",
          "html",
          page.url,
          match[0],
        ),
      );
    }
    items.push({
      name: boundedText(name, 120),
      description: boundedText(description, 320),
      price: parsedPrice !== null && currency ? parsedPrice : null,
      currency,
      availability,
      imageUrl: image?.value ?? null,
    });
  }
  return items;
}

function microdataProperty(scope: string, property: string): string {
  const escaped = property.replace(/[^a-z0-9-]/gi, "");
  const tag = scope.match(
    new RegExp(`<[^>]+itemprop=["']${escaped}["'][^>]*>`, "i"),
  )?.[0];
  if (tag) {
    const attributes = parseAttributes(tag);
    const explicit = attributes.content ?? attributes.datetime ?? attributes.src;
    if (explicit) return cleanText(explicit);
  }
  const element = scope.match(
    new RegExp(`<[^>]+itemprop=["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i"),
  );
  return cleanText(element?.[1] ?? "");
}

function catalogItem(
  entity: JsonRecord,
  sourceUrl: URL,
  evidence: ReconstructionEvidence[],
  brandAssets: ExtractedBrandAsset[],
): ExtractedCatalogItem | null {
  const nested = isRecord(entity.item)
    ? entity.item
    : isRecord(entity.itemOffered)
      ? entity.itemOffered
      : entity;
  const name = boundedText(stringValue(nested.name) || stringValue(entity.name), 120);
  if (!name) return null;
  const offer = asJsonRecords(nested.offers ?? entity.offers)[0] ?? null;
  const rawPrice = offer?.price ?? nested.price ?? entity.price;
  const parsedPrice = typeof rawPrice === "number"
    ? rawPrice
    : typeof rawPrice === "string" && /^\d+(?:[.,]\d{1,2})?$/.test(rawPrice.trim())
      ? Number(rawPrice.replace(",", "."))
      : null;
  const rawCurrency = stringValue(offer?.priceCurrency ?? nested.priceCurrency ?? entity.priceCurrency).toUpperCase();
  const currency = supportedCurrencies.has(rawCurrency) ? rawCurrency : null;
  const price = parsedPrice !== null && currency ? parsedPrice : null;
  const availability = catalogAvailability(
    offer?.availability ?? nested.availability ?? entity.availability,
  );
  const image = resolveAssetCandidate(assetValue(nested.image), sourceUrl, "json-ld", nested);
  addAsset(brandAssets, "content", image);
  addEvidence(evidence, "catalog.item", candidate(name, "json-ld", sourceUrl, nested));
  if (availability !== null) {
    addEvidence(
      evidence,
      "catalog.availability",
      candidate(
        availability ? "in stock" : "unavailable",
        "json-ld",
        sourceUrl,
        offer?.availability ?? nested.availability ?? entity.availability,
      ),
    );
  }
  return {
    name,
    description: boundedText(stringValue(nested.description), 320),
    price,
    currency,
    availability,
    imageUrl: image?.value ?? null,
  };
}

function catalogAvailability(value: unknown): boolean | null {
  const raw = typeof value === "string"
    ? value
    : isRecord(value)
      ? stringValue(value["@id"] ?? value.url ?? value.name)
      : "";
  const status = raw.split(/[\/#]/).pop()?.toLowerCase().replace(/[^a-z]/g, "");
  if (status === "instock") return true;
  if (["outofstock", "soldout", "discontinued"].includes(status ?? "")) {
    return false;
  }
  return null;
}

function asJsonRecords(value: unknown): JsonRecord[] {
  return (Array.isArray(value) ? value : [value]).flatMap((entry) => {
    if (!isRecord(entry)) return [];
    if (isRecord(entry.item)) return [entry.item];
    return [entry];
  });
}

function extractLocale(page: ReconstructedPage, business: JsonRecord | null): string | null {
  const htmlAttributes = parseAttributes(page.html.match(/<html\b([^>]*)>/i)?.[1] ?? "");
  const values = [
    htmlAttributes.lang,
    metaCandidate(page, "content-language")?.value,
    metaCandidate(page, "og:locale")?.value,
    stringValue(business?.inLanguage),
  ];
  for (const value of values) {
    const language = value?.trim().replace("_", "-").split("-")[0]?.toLowerCase();
    if (language && /^[a-z]{2}$/.test(language)) return language;
  }
  return null;
}

function extractPaletteCandidates(page: ReconstructedPage): PaletteCandidates {
  const candidates: Array<{ property: string; color: string; excerpt: string }> = [];
  const theme = metaCandidate(page, "theme-color");
  const themeAccent = theme && normalizedColor(theme.value)
    ? { ...theme, value: normalizedColor(theme.value)! }
    : undefined;
  if (theme && normalizedColor(theme.value)) {
    candidates.push({ property: "theme-color", color: theme.value, excerpt: theme.excerpt });
  }
  const css = [
    ...(page.html.match(/<style\b[^>]*>([\s\S]*?)<\/style>/gi) ?? []),
    ...Array.from(page.html.matchAll(/\bstyle=["']([^"']+)["']/gi), (match) => match[1] ?? ""),
  ].join("\n").slice(0, 120_000);
  for (const match of css.matchAll(/([\w-]*(?:background|surface|foreground|text|primary|accent|brand|color)[\w-]*)\s*:\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\))/gi)) {
    if (!match[1] || !match[2] || !normalizedColor(match[2])) continue;
    candidates.push({ property: match[1].toLowerCase(), color: match[2], excerpt: match[0] });
    if (candidates.length >= 80) break;
  }
  const pick = (pattern: RegExp): Candidate | undefined => {
    const found = candidates.find((entry) => pattern.test(entry.property));
    return found
      ? candidate(normalizedColor(found.color)!, "css", page.url, found.excerpt)
      : undefined;
  };
  return {
    background: pick(/(?:background|surface|--bg)/),
    foreground: pick(/(?:foreground|text|--fg)/),
    accent: themeAccent ?? pick(/(?:primary|accent|brand)/),
  };
}

function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    const name = match[1]?.toLowerCase();
    if (!name) continue;
    attributes[name] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function candidate(
  value: string,
  method: ReconstructionEvidenceMethod,
  sourceUrl: URL,
  excerpt: unknown,
): Candidate {
  const rawExcerpt =
    typeof excerpt === "string" ? excerpt.replace(/\s+/g, " ").trim() : safeStringify(excerpt);
  const textExcerpt = typeof excerpt === "string" ? cleanText(excerpt) : rawExcerpt;
  return {
    value: cleanText(value),
    method,
    sourceUrl: sourceUrl.toString(),
    excerpt: boundedText(textExcerpt || rawExcerpt, 280),
  };
}

function addEvidence(
  evidence: ReconstructionEvidence[],
  field: string,
  source: Candidate | null | undefined,
): void {
  if (!source || !source.value || evidence.length >= MAX_EVIDENCE_RECORDS) return;
  const value = boundedText(cleanText(source.value), 500);
  if (!value) return;
  if (evidence.some((item) => item.field === field && item.value === value)) {
    return;
  }
  evidence.push({ field, ...source, value });
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? cleanText(value) : "";
}

function cleanText(value: string): string {
  const stripped = value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  // Entity decoding can reveal markup only after the first stripping pass.
  return decodeHtml(stripped).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_match, decimal: string) =>
      decodeNumericHtmlEntity(decimal, 10),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) =>
      decodeNumericHtmlEntity(hex, 16),
    )
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeNumericHtmlEntity(value: string, radix: 10 | 16): string {
  const codePoint = Number.parseInt(value, radix);
  if (
    !Number.isSafeInteger(codePoint) ||
    codePoint <= 0 ||
    codePoint > 0x10ffff ||
    (codePoint >= 0xd800 && codePoint <= 0xdfff)
  ) {
    return "\uFFFD";
  }
  return String.fromCodePoint(codePoint);
}

function boundedText(value: string, length: number): string {
  return value.trim().slice(0, length);
}

function normalizePhone(value: string): string {
  const cleaned = value.replace(/[^\d+().\s-]/g, "").replace(/\s+/g, " ").trim();
  return cleaned.replace(/\D/g, "").length >= 5 ? cleaned : "";
}

function normalizeEmail(value: string): string {
  let cleaned = value.trim();
  if (/^mailto:/i.test(cleaned)) {
    try {
      const mailto = new URL(cleaned);
      if (mailto.protocol !== "mailto:") return "";
      cleaned = decodeURIComponent(mailto.pathname);
    } catch {
      return "";
    }
  } else if (/[?#]/.test(cleaned)) {
    return "";
  }

  try {
    return normalizeAccountEmail(cleaned);
  } catch {
    return "";
  }
}

function validEmailCandidate(source: Candidate | null): Candidate | null {
  if (!source) return null;
  const value = normalizeEmail(source.value);
  return value ? { ...source, value } : null;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPrivateIpv4Literal(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return (
    octets[0] === 0 ||
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168) ||
    octets[0] >= 224
  );
}

function normalizedColor(value: string | undefined): string | null {
  if (!value) return null;
  const color = parseColor(value);
  return color ? rgbToHex(color) : null;
}

function parseColor(value: string): { r: number; g: number; b: number } | null {
  const input = value.trim().toLowerCase();
  const hex = input.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i)?.[1];
  if (hex) {
    const expanded = hex.length <= 4
      ? hex.slice(0, 3).split("").map((digit) => `${digit}${digit}`).join("")
      : hex.slice(0, 6);
    return {
      r: Number.parseInt(expanded.slice(0, 2), 16),
      g: Number.parseInt(expanded.slice(2, 4), 16),
      b: Number.parseInt(expanded.slice(4, 6), 16),
    };
  }
  const rgb = input.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (!rgb?.[1] || !rgb[2] || !rgb[3]) return null;
  const values = [rgb[1], rgb[2], rgb[3]].map(Number);
  if (values.some((entry) => !Number.isFinite(entry) || entry < 0 || entry > 255)) return null;
  return { r: values[0], g: values[1], b: values[2] };
}

function rgbToHex(color: { r: number; g: number; b: number }): string {
  return `#${[color.r, color.g, color.b]
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}

function relativeLuminance(color: { r: number; g: number; b: number }): number {
  const [red, green, blue] = [color.r, color.g, color.b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function bestTextColor(background: string): string {
  return contrastRatio(background, "#000000") >= contrastRatio(background, "#ffffff")
    ? "#000000"
    : "#ffffff";
}

function blendUntilContrast(
  start: string,
  target: string,
  background: string,
  minimum: number,
): string {
  const from = parseColor(start)!;
  const to = parseColor(target)!;
  for (let step = 1; step <= 20; step += 1) {
    const ratio = step / 20;
    const color = rgbToHex({
      r: from.r + (to.r - from.r) * ratio,
      g: from.g + (to.g - from.g) * ratio,
      b: from.b + (to.b - from.b) * ratio,
    });
    if (contrastRatio(background, color) >= minimum) return color;
  }
  return target;
}
