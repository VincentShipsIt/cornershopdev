import type { SiteIntegrationView } from "@/lib/site-draft";
import { resolveVerticalConfig } from "@/lib/verticals/registry";
import type { VerticalId } from "@/lib/verticals/types";

export type ResolvedBookingEmbed = {
  provider: string;
  src: string;
  origin: string;
  height: number;
};

/**
 * Decides whether a booking integration may be rendered as a third-party frame,
 * and with what `src`. Everything reaching this function is owner-influenced —
 * the URL came off the owner's own website via the importer, the venue id can be
 * typed into the editor — so the answer is built from the vertical's provider
 * table rather than from the input:
 *
 *  1. the *URL* has to match a provider `pattern` (matching the free-text
 *     `provider` label instead would let a renamed label pick the provider),
 *  2. that provider has to publish an embed descriptor at all,
 *  3. the venue id has to match the provider's anchored `idPattern` in full,
 *  4. and the URL the descriptor builds has to land on the origin it declared —
 *     redundant while `buildSrc` is a literal template, but it means a future
 *     descriptor cannot widen the CSP allow-list by accident.
 *
 * Any failure returns `null`, which the caller renders as a plain link-out. The
 * degrade path is the common one: only OpenTable embeds in vertical #1.
 */
export function resolveBookingEmbed(
  vertical: VerticalId,
  integration: SiteIntegrationView,
): ResolvedBookingEmbed | null {
  if (!integration.enabled || integration.type !== "booking") return null;

  const config = resolveVerticalConfig(vertical);
  let hostname: string;
  try {
    hostname = new URL(integration.url).hostname;
  } catch {
    return null;
  }
  const provider = config.providers.find(
    (candidate) =>
      candidate.embed &&
      (candidate.hostnamePattern?.test(hostname) ??
        candidate.pattern.test(hostname)),
  );
  const embed = provider?.embed;
  if (!provider || !embed) return null;

  const venueId = integration.venueId ?? embed.extractVenueId?.(integration.url);
  if (!venueId || !embed.idPattern.test(venueId)) return null;

  const src = embed.buildSrc(venueId);
  if (!src.startsWith(`${embed.origin}/`)) return null;

  return {
    provider: provider.name,
    src,
    origin: embed.origin,
    height: embed.height,
  };
}
