export type AnalyticsHeaderReader = Pick<Headers, "get">;

export type AnalyticsHostSite = {
  id: string;
  slug: string;
  verified: boolean;
};

export type AnalyticsHostLookup = (
  hostname: string,
) => Promise<AnalyticsHostSite | null>;

const automatedUserAgent =
  /(bot|crawler|spider|slurp|bingpreview|facebookexternalhit|headlesschrome|lighthouse|pagespeed|google-inspectiontool)/i;

/**
 * Reads the public hostname before a reverse proxy can replace it with the
 * container address. Only the first forwarded value belongs to the caller.
 */
export function analyticsRequestHostname(
  headers: AnalyticsHeaderReader,
): string {
  const forwarded = firstHeaderValue(headers.get("x-forwarded-host"));
  const host = forwarded || firstHeaderValue(headers.get("host"));
  return normalizeHostname(host);
}

/**
 * Uses request headers only as a transient rejection signal. Callers receive a
 * boolean, not the identifying header values, so no persistence surface exists.
 */
export function isLikelyAutomatedRequest(
  headers: AnalyticsHeaderReader,
): boolean {
  const purpose = [
    headers.get("purpose"),
    headers.get("sec-purpose"),
    headers.get("x-purpose"),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
  if (/\b(prefetch|prerender)\b/i.test(purpose)) return true;
  if (headers.get("next-router-prefetch") !== null) return true;

  const userAgent = headers.get("user-agent")?.trim() ?? "";
  return !userAgent || automatedUserAgent.test(userAgent);
}

/**
 * Resolves a hostname only after excluding platform-owned domains. The lookup
 * remains injected so the policy is pure and can be backed by a verified Domain
 * query without importing Prisma into this module.
 */
export async function resolveEligibleAnalyticsSite({
  hostname,
  isFactory,
  lookup,
}: {
  hostname: string;
  isFactory: (hostname: string) => boolean;
  lookup: AnalyticsHostLookup;
}): Promise<AnalyticsHostSite | null> {
  const normalized = normalizeHostname(hostname);
  if (!normalized || isFactory(normalized)) return null;

  const site = await lookup(normalized);
  return site?.verified ? site : null;
}

function firstHeaderValue(value: string | null): string {
  return value?.split(",")[0]?.trim() ?? "";
}

function normalizeHostname(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith("[")) {
    const closingBracket = normalized.indexOf("]");
    return closingBracket > 0
      ? normalized.slice(1, closingBracket)
      : normalized;
  }
  return normalized.replace(/:\d+$/, "").replace(/\.$/, "");
}
