import { normalizeHostname } from "@/lib/request-hostname";
import {
  listVerticalIds,
  resolveVerticalByHostname,
  resolveVerticalConfig,
} from "@/lib/verticals/registry";
import type { VerticalId } from "@/lib/verticals/types";

export { requestHostname } from "@/lib/request-hostname";

/**
 * The factory's own hostnames, overridable so a staging box can answer for its
 * own names without a code change. A niche's domain is deliberately absent: those
 * come from the vertical registry below, so adding nails or barbers stays a
 * config entry.
 */
const DEFAULT_PLATFORM_HOSTNAMES =
  "cornershop.dev,www.cornershop.dev,api.cornershop.dev,domains.cornershop.dev";

/**
 * Labels that sit on a launched niche or factory apex but are never a customer
 * site slug. `www` is the niche marketing alias; `api`/`assets`/`domains` are
 * operator ingress; `send` is the niche mail domain.
 */
const RESERVED_PLATFORM_SLUGS = new Set([
  "www",
  "api",
  "assets",
  "domains",
  "send",
]);

const DNS_LABEL_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)$/;

export type PlatformSubdomain = {
  slug: string;
  parentHostname: string;
};

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
 * Parents that may host `<slug>.<parent>` customer sites: each launched niche
 * domain from the registry, plus the two-label factory apex (`cornershop.dev`).
 * `www`/`api`/`domains` are never parents — `le-petit.www.cornershop.dev` is not
 * a customer URL.
 */
export function platformSubdomainParents(
  configured: string | undefined = process.env.PLATFORM_HOSTNAMES,
): string[] {
  const parents = new Set<string>();
  for (const hostname of platformHostnames(configured)) {
    if (hostname.split(".").length === 2) parents.add(hostname);
  }
  for (const id of listVerticalIds()) {
    const domain = resolveVerticalConfig(id).marketing.domain;
    if (domain) parents.add(domain.trim().toLowerCase());
  }
  return [...parents].sort((left, right) => right.length - left.length);
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
 *
 * Customer platform subdomains (`le-petit-meunier.restofront.com`) are not
 * factory hosts. Authorizing their certificates is `isOnDemandTlsHostname`.
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

/**
 * Parses `<slug>.<niche-or-factory-apex>` into a customer slug. Apex, `www`,
 * `api`, `assets`, `domains`, and `send` are never slugs. Extra labels
 * (`foo.bar.restofront.com`) are rejected so they fall through to the custom
 * Domain table instead of minting a nested platform host.
 */
export function parsePlatformSubdomain(
  hostname: string,
  configured?: string,
): PlatformSubdomain | null {
  const wanted = normalizeHostname(hostname);
  if (!wanted) return null;
  for (const parent of platformSubdomainParents(configured)) {
    const suffix = `.${parent}`;
    if (!wanted.endsWith(suffix)) continue;
    const slug = wanted.slice(0, -suffix.length);
    if (!slug || slug.includes(".")) return null;
    if (RESERVED_PLATFORM_SLUGS.has(slug)) return null;
    if (!DNS_LABEL_PATTERN.test(slug)) return null;
    return { slug, parentHostname: parent };
  }
  return null;
}

/**
 * Reserved operator/marketing labels under a platform parent. Not a customer
 * slug, and not automatically a factory host (`api.restofront.com` stays closed).
 */
export function isReservedPlatformHostname(
  hostname: string,
  configured?: string,
): boolean {
  const wanted = normalizeHostname(hostname);
  if (!wanted) return false;
  for (const parent of platformSubdomainParents(configured)) {
    const suffix = `.${parent}`;
    if (!wanted.endsWith(suffix)) continue;
    const slug = wanted.slice(0, -suffix.length);
    if (!slug || slug.includes(".")) return false;
    return RESERVED_PLATFORM_SLUGS.has(slug);
  }
  return false;
}

/**
 * Syntactic check for hosts Caddy might ask about. Factory/niche apexes are
 * issued without a DB row. Customer platform slugs still need a Site row in
 * `/api/domains/authorize` so unused labels cannot exhaust TLS quota.
 */
export function isOnDemandTlsHostname(
  hostname: string,
  configured?: string,
): boolean {
  return (
    isFactoryHostname(hostname, configured) ||
    parsePlatformSubdomain(hostname, configured) !== null
  );
}

/**
 * Public hostname for a claimed site until a verified custom domain exists.
 * Launched niches use their marketed domain; everyone else falls back to the
 * factory apex.
 */
export function platformSiteHostname(
  slug: string,
  vertical?: VerticalId,
  configured?: string,
): string {
  const normalizedSlug = slug.trim().toLowerCase();
  const domain =
    vertical === undefined
      ? null
      : resolveVerticalConfig(vertical).marketing.domain;
  const parent =
    domain?.trim().toLowerCase() ||
    platformSubdomainParents(configured).find((candidate) =>
      platformHostnames(configured).has(candidate),
    ) ||
    "cornershop.dev";
  return `${normalizedSlug}.${parent}`;
}
