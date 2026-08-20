import {
  aiIsConfigured,
  enhanceSiteImage,
  generateSiteDraft,
  type SiteImageEnhancementRequest,
} from "@/lib/ai/site-generation";
import { inspectSource, type ExtractedSite } from "@/lib/importer";
import { withoutUnreviewedSourcePhotos } from "@/lib/photo-draft-safety";
import type { PersistableSiteDraft } from "@/lib/site-persistence";
import { resolveVerticalConfig } from "@/lib/verticals/registry";
import type { VerticalId } from "@/lib/verticals/types";

/** Re-exported so callers gate on the pipeline facade, not the model layer. */
export { aiIsConfigured };

/**
 * The import pipeline addressed by `Vertical` value instead of by resolved
 * config — the form every runtime caller actually needs. Callers that only know
 * a `Vertical` at runtime (the import route, the import workflow) go through the
 * helpers below and get the abstract `PersistableSiteDraft` surface back, over
 * the variance erasure documented in `verticals/registry.ts`. That is what lets
 * a new vertical ship without editing the workflow, the importer or the renderer.
 */
export async function crawlSiteSource(
  source: string,
  vertical: VerticalId,
): Promise<ExtractedSite> {
  return inspectSource(source, resolveVerticalConfig(vertical));
}

export async function generateDraftForVertical(
  source: ExtractedSite,
  vertical: VerticalId,
): Promise<PersistableSiteDraft> {
  const draft = await generateSiteDraft(source, resolveVerticalConfig(vertical));
  return withoutUnreviewedSourcePhotos(draft);
}

export async function enhanceSiteHeroImage(
  request: SiteImageEnhancementRequest,
  vertical: VerticalId,
): Promise<{ data: Uint8Array; mediaType: string; costMicros: number | null }> {
  return enhanceSiteImage(request, resolveVerticalConfig(vertical));
}
