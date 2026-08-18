import { headers } from "next/headers";
import { FACTORY_BRAND, type BrandIdentity } from "@/lib/brand";
import { emailReplyTo, emailSender } from "@/lib/resend";
import { requestHostname, type HeaderReader } from "@/lib/request-hostname";
import {
  resolveVerticalByHostname,
  resolveVerticalConfig,
} from "@/lib/verticals/registry";
import type { VerticalId } from "@/lib/verticals/types";

const FACTORY_HOME_URL = "https://cornershop.dev";

/**
 * Everything a screen or an outbound email needs to speak as the right
 * brand — the niche a business bought (Restofrontapp) or the factory that
 * built it (Cornershopdev), never a mix of the two. A superset of
 * `BrandIdentity`: `vertical`, `homeUrl`, `supportEmail` and `fromAddress`
 * are what the funnel (create, claim, dashboard, auth emails) needs beyond
 * the wordmark and mark `BrandIdentity` already carries.
 */
export type BrandContext = BrandIdentity & {
  /** The niche this context speaks for, or null for the factory itself. */
  vertical: VerticalId | null;
  homeUrl: string;
  supportEmail?: string;
  fromAddress?: string;
};

/**
 * The resolver every other function in this module funnels through, so a
 * niche's wordmark, home link and mail identity can never drift apart from
 * one another. `vertical: null` is the factory — the same "no niche claims
 * this" signal `resolveVerticalByHostname` already returns to its other
 * callers, so a caller that already has one can hand it straight in.
 */
export function brandContextForVertical(
  vertical: VerticalId | null,
): BrandContext {
  const marketing = vertical
    ? resolveVerticalConfig(vertical).marketing
    : null;
  return {
    ...(marketing?.brand ?? FACTORY_BRAND),
    vertical,
    homeUrl: marketing?.domain
      ? `https://${marketing.domain}`
      : FACTORY_HOME_URL,
    supportEmail: emailReplyTo(vertical),
    fromAddress: emailSender(vertical),
  };
}

/**
 * The (a) half of the issue's brief: which niche a request's hostname
 * belongs to. Reuses the registry's own hostname table — the same one
 * `proxy.ts` and `@/lib/verticals/request-site` resolve against — rather
 * than keeping a second list of domains here.
 */
export function brandContextForHostname(hostname: string): BrandContext {
  return brandContextForVertical(resolveVerticalByHostname(hostname));
}

/**
 * Sync core behind `resolveRequestBrandContext`, taking headers as a value
 * rather than reading them itself so tests can pass a fixed `Headers`
 * instance instead of depending on a real request.
 */
export function brandContextForHeaders(reader: HeaderReader): BrandContext {
  return brandContextForHostname(requestHostname(reader));
}

/**
 * The (a) half for real request-handling code: resolves from the incoming
 * request's own Host header. Covers the same ground as
 * `resolveRequestBrand`/`resolveRequestMarketing` in
 * `@/lib/verticals/request-site`, which already serve sign-in and the
 * dashboard with the narrower `BrandIdentity`/`VerticalMarketing` shapes
 * those call sites needed; this covers the funnel's wider needs (home link,
 * mail identity) without a second hostname walk.
 */
export async function resolveRequestBrandContext(): Promise<BrandContext> {
  return brandContextForHeaders(await headers());
}

/**
 * The (b) half of the issue's brief: server code that has a `Site` (and so
 * its `vertical`) but no request to read a Host header from — a claim link
 * opened from anywhere, a background job, an email builder. The site itself
 * knows which niche produced it, which is a stronger signal than any Host
 * header a claim link happens to be opened from.
 */
export function brandContextForSiteVertical(
  vertical: VerticalId,
): BrandContext {
  return brandContextForVertical(vertical);
}
