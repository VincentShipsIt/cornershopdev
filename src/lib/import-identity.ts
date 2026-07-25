const bareDomainPattern =
  /^(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\.)+[a-z]{2,63}(?::\d{1,5})?(?:[/?#][^\s]*)?$/i;

export type ImportUrls = {
  preview: string;
  claim: string;
};

export function normalizeImportSource(rawSource: string): string {
  const source = rawSource.trim().normalize("NFKC");
  const looksLikeUrl =
    /^(?:https?:\/\/|www\.)/i.test(source) ||
    bareDomainPattern.test(source);

  if (!looksLikeUrl) {
    return `name:${source.toLocaleLowerCase("en").replace(/\s+/g, " ")}`;
  }

  const url = new URL(
    /^https?:\/\//i.test(source) ? source : `https://${source}`,
  );
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  const port =
    (url.protocol === "http:" && url.port === "80") ||
    (url.protocol === "https:" && url.port === "443")
      ? ""
      : url.port
        ? `:${url.port}`
        : "";
  const pathname =
    url.pathname === "/"
      ? ""
      : url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "");

  return `url:${hostname}${port}${pathname}`;
}

export function buildImportUrls(slug: string): ImportUrls {
  const encodedSlug = encodeURIComponent(slug);
  return {
    preview: `/preview/${encodedSlug}`,
    claim: `/claim/${encodedSlug}`,
  };
}

export function storedImportSource(rawSource: string): string {
  const source = rawSource.trim().normalize("NFKC");
  const looksLikeUrl =
    /^(?:https?:\/\/|www\.)/i.test(source) ||
    bareDomainPattern.test(source);
  if (!looksLikeUrl) return source;

  const url = new URL(
    /^https?:\/\//i.test(source) ? source : `https://${source}`,
  );
  url.username = "";
  url.password = "";
  url.hash = "";
  return url.toString();
}

export function slugCollisionCandidate(
  baseSlug: string,
  collisionIndex: number,
): string {
  if (collisionIndex === 0) return baseSlug.slice(0, 72);
  const suffix = `-${collisionIndex + 1}`;
  return `${baseSlug.slice(0, 72 - suffix.length)}${suffix}`;
}

export function importFailureMessage(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown restaurant import error";
  return message
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^@\s/]+@/gi, "$1[redacted]@")
    .replace(
      /\b(password|secret|token|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi,
      "$1=[redacted]",
    )
    .slice(0, 500);
}
