import { headers } from "next/headers";
import { FACTORY_BRAND, type BrandIdentity } from "@/lib/brand";
import {
  resolveVerticalByHostname,
  resolveVerticalConfig,
} from "@/lib/verticals/registry";
import type { VerticalMarketing } from "@/lib/verticals/types";

const FACTORY_ORIGIN = "https://cornershop.dev";

/**
 * The hostname the visitor actually typed. `x-forwarded-host` first, and only
 * its first entry, matching how `proxy.ts` reads it: in production Caddy
 * terminates TLS and `host` is the container's own address, so trusting `host`
 * would make every niche look like the factory the moment this ships behind the
 * reverse proxy.
 */
async function requestHostname(): Promise<string> {
  const requestHeaders = await headers();
  return (
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    ""
  )
    .split(",")[0]
    .trim();
}

/**
 * Which brand the current request should wear, for the screens that have no
 * vertical of their own to read — sign-in, the dashboard shell. `proxy.ts` only
 * rewrites `/` and `/preview/*`, so these routes are served straight off whatever
 * niche domain the visitor was on, and the Host header is the only thing that
 * still knows which storefront they came from.
 *
 * Falls back to the factory brand for the platform's own hosts and for anything
 * unrecognised. Screens that do know their vertical — the claim page, the import
 * studio — should read it from the site or the picker instead of calling this.
 *
 * Reading headers opts the caller into dynamic rendering, which is already true
 * of every screen that needs this.
 */
export async function resolveRequestBrand(): Promise<BrandIdentity> {
  return (await resolveRequestMarketing())?.brand ?? FACTORY_BRAND;
}

/**
 * The niche marketing contract for the hostname the visitor used. Shared
 * customer surfaces consume this instead of guessing a trade from the route.
 */
export async function resolveRequestMarketing(): Promise<VerticalMarketing | null> {
  const niche = resolveVerticalByHostname(await requestHostname());
  return niche ? resolveVerticalConfig(niche).marketing : null;
}

/**
 * The public origin to write into `robots.txt` and `sitemap.xml`. Both are served
 * on every domain the app answers on, so a hardcoded cornershop.dev would point a
 * crawler on restofront.com at a different site's sitemap.
 *
 * A niche resolves to its own launched domain; everything else — the factory's
 * hosts, and any niche not yet on a domain — to cornershop.dev.
 */
export async function resolveRequestOrigin(): Promise<string> {
  const niche = resolveVerticalByHostname(await requestHostname());
  if (!niche) return FACTORY_ORIGIN;
  const { domain } = resolveVerticalConfig(niche).marketing;
  return domain ? `https://${domain}` : FACTORY_ORIGIN;
}
