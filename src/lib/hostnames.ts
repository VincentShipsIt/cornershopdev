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
  env: { PLATFORM_HOSTNAMES?: string } = process.env,
): Set<string> {
  return new Set(
    (env.PLATFORM_HOSTNAMES || DEFAULT_PLATFORM_HOSTNAMES)
      .split(",")
      .map((hostname) => hostname.trim().toLowerCase())
      .filter(Boolean),
  );
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
  env?: { PLATFORM_HOSTNAMES?: string },
): boolean {
  const wanted = hostname.trim().toLowerCase().split(":")[0];
  if (!wanted) return false;
  return (
    platformHostnames(env).has(wanted) ||
    resolveVerticalByHostname(wanted) !== null
  );
}
