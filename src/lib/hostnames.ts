import { resolveVerticalByHostname } from "@/lib/verticals/registry";

/**
 * The factory's own hostnames, overridable so a staging box can answer for its
 * own names without a code change. A niche's domain is deliberately absent: those
 * come from the vertical registry below, so adding nails or barbers stays a
 * config entry.
 */
const DEFAULT_PLATFORM_HOSTNAMES =
  "cornershop.dev,www.cornershop.dev,api.cornershop.dev,domains.cornershop.dev";

export function platformHostnames(
  configured: string | undefined = process.env.PLATFORM_HOSTNAMES,
): Set<string> {
  return new Set(
    (configured || DEFAULT_PLATFORM_HOSTNAMES)
      .split(",")
      .map((hostname) => hostname.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Normalizes the original public hostname at the reverse-proxy boundary.
 * Caddy supplies `x-forwarded-host`; the first value is authoritative when
 * multiple proxies have appended entries.
 */
export function requestHostname(headers: Headers): string {
  const forwardedHost = headers.get("x-forwarded-host");
  return (forwardedHost ?? headers.get("host") ?? "")
    .split(",")[0]
    .trim()
    .split(":")[0]
    .toLowerCase();
}

/**
 * Whether a hostname belongs to the factory itself — its own domains, or the
 * marketing domain of a registered niche — as opposed to a customer's.
 *
 * Caddy asks this (through `/api/domains/authorize`) before issuing a
 * certificate under on-demand TLS. Without it the only hostnames that can get
 * one are verified rows in the domain table, which is every customer site and
 * none of ours: cornershop.dev and restofront.com would resolve, get refused a
 * certificate, and never serve. Deriving the niche half from the registry means
 * the next niche domain gets its certificate by being registered, the same way
 * it gets its routing.
 */
export function isFactoryHostname(
  hostname: string,
  configured?: string,
): boolean {
  const wanted = hostname.trim().toLowerCase().split(":")[0];
  if (!wanted) return false;
  return (
    platformHostnames(configured).has(wanted) ||
    resolveVerticalByHostname(wanted) !== null
  );
}
