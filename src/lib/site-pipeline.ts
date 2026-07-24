import {
  enhanceSiteImage,
  generateSiteDraft,
  type SiteImageEnhancementRequest,
} from "@/lib/ai/site-generation";
import { inspectSource, type ExtractedSite } from "@/lib/importer";
import type { PersistableSiteDraft } from "@/lib/site-persistence";
import { getVerticalConfig } from "@/lib/verticals/registry";
import type { VerticalConfig, VerticalId } from "@/lib/verticals/types";

/**
 * The import pipeline addressed by `Vertical` value instead of by resolved
 * config — the form every runtime caller actually needs.
 *
 * `VerticalConfig` is contravariant in its attribute types: `templates.resolve`,
 * `normalizeGeneratedAttributes`, `rendererCapabilities` and
 * `presentation.buildEyebrow` all *consume* them. So the moment the registry
 * holds a second vertical, `getVerticalConfig(id)` returns a union that a
 * generic function cannot infer against — `(a: RestaurantAttributes) => T` is
 * not assignable to `(a: RestaurantAttributes | BeautyAttributes) => T`.
 *
 * Callers that only know a `Vertical` at runtime (the import route, the import
 * workflow) go through the helpers below and get the abstract
 * `PersistableSiteDraft` surface back. That keeps the variance erasure in one
 * documented place rather than at every call site, and is what lets a new
 * vertical ship without editing the workflow, the importer or the renderer.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ErasedVerticalConfig = VerticalConfig<any, any, any, any>;

function resolveErased(vertical: VerticalId): ErasedVerticalConfig {
  return getVerticalConfig(vertical);
}

export async function crawlSiteSource(
  source: string,
  vertical: VerticalId,
): Promise<ExtractedSite> {
  return inspectSource(source, getVerticalConfig(vertical));
}

export async function generateDraftForVertical(
  source: ExtractedSite,
  vertical: VerticalId,
): Promise<PersistableSiteDraft> {
  return generateSiteDraft(source, resolveErased(vertical));
}

export async function enhanceSiteHeroImage(
  request: SiteImageEnhancementRequest,
  vertical: VerticalId,
): Promise<{ data: Uint8Array; mediaType: string }> {
  return enhanceSiteImage(request, getVerticalConfig(vertical));
}
