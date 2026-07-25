import { getWritable } from "workflow";
import { fetchPublicImage, type ExtractedSite } from "@/lib/importer";
import { importFailureMessage } from "@/lib/import-identity";
import {
  persistSiteImport,
  recordImportFailure,
  updateImportJob,
  type PersistableSiteDraft,
  type PersistedSiteImport,
} from "@/lib/site-persistence";
import {
  crawlSiteSource,
  enhanceSiteHeroImage,
  generateDraftForVertical,
} from "@/lib/site-pipeline";
import { imageStorageIsConfigured, storeSiteImage } from "@/lib/storage/images";
import type { VerticalId } from "@/lib/verticals/types";

type PersistedImport = PersistedSiteImport<PersistableSiteDraft>;

export type SiteImportEvent =
  | {
      type: "progress";
      stage: "crawl" | "extract" | "compose" | "persist";
      progress: number;
      message: string;
    }
  | {
      type: "complete";
      draft: PersistableSiteDraft;
      vertical: VerticalId;
      importJobId: string;
      urls: PersistedImport["urls"];
    }
  | { type: "failed"; message: string };

/**
 * Steps receive the plain `Vertical` value, never a resolved `VerticalConfig`:
 * step arguments cross a serialization boundary and a config carries RegExp and
 * function members. Re-resolving inside each step also means a config fix
 * deployed mid-flight is picked up when a suspended run resumes.
 */
export async function siteImportWorkflow(
  source: string,
  importJobId: string,
  vertical: VerticalId,
): Promise<PersistableSiteDraft> {
  "use workflow";

  try {
    console.log(`[site-import] START job=${importJobId} vertical=${vertical}`);
    await setImportStage(importJobId, "CRAWLING");
    await emit({
      type: "progress",
      stage: "crawl",
      progress: 12,
      message: "Reading the current website",
    });
    const extracted = await crawlSite(source, vertical);
    await setImportStage(importJobId, "EXTRACTING");
    await emit({
      type: "progress",
      stage: "extract",
      progress: 42,
      message: "Recovering catalog, contacts and existing links",
    });
    await setImportStage(importJobId, "GENERATING");
    await emit({
      type: "progress",
      stage: "compose",
      progress: 65,
      message: "Composing the mobile-first preview",
    });
    const draft = await composeDraft(extracted, vertical);
    const enhancedDraft = await enhanceDraftImages(draft, vertical);
    await emit({
      type: "progress",
      stage: "compose",
      progress: 88,
      message: "Checking every photo, catalog entry and integration",
    });
    await emit({
      type: "progress",
      stage: "persist",
      progress: 95,
      message: "Saving the private preview",
    });
    const persisted = await persistDraft(
      enhancedDraft,
      source,
      importJobId,
      vertical,
    );
    await emitComplete(persisted, vertical);
    console.log(`[site-import] DONE slug=${persisted.draft.slug}`);
    return persisted.draft;
  } catch (error) {
    const message = importFailureMessage(error);
    await failImport(importJobId, message);
    await emit({ type: "failed", message });
    throw error;
  }
}

async function emit(event: SiteImportEvent): Promise<void> {
  "use step";
  const writer = getWritable<SiteImportEvent>().getWriter();
  try {
    await writer.write(event);
  } finally {
    writer.releaseLock();
  }
}

async function crawlSite(
  source: string,
  vertical: VerticalId,
): Promise<ExtractedSite> {
  "use step";
  console.log(`[site-import:crawl] START source=${source}`);
  const result = await crawlSiteSource(source, vertical);
  console.log(
    `[site-import:crawl] DONE name=${result.name} links=${result.links.length}`,
  );
  return result;
}

async function composeDraft(
  source: ExtractedSite,
  vertical: VerticalId,
): Promise<PersistableSiteDraft> {
  "use step";
  console.log(`[site-import:compose] START name=${source.name}`);
  const draft = await generateDraftForVertical(source, vertical);
  console.log(
    `[site-import:compose] DONE slug=${draft.slug} sections=${draft.catalogSections.length}`,
  );
  return draft;
}

async function setImportStage(
  importJobId: string,
  status: "CRAWLING" | "EXTRACTING" | "GENERATING",
): Promise<void> {
  "use step";
  await updateImportJob(importJobId, { status });
}

async function persistDraft(
  draft: PersistableSiteDraft,
  source: string,
  importJobId: string,
  vertical: VerticalId,
): Promise<PersistedImport> {
  "use step";
  console.log(`[site-import:persist] START slug=${draft.slug}`);
  const result = await persistSiteImport<PersistableSiteDraft>({
    draft,
    vertical,
    source,
    importJobId,
  });
  console.log(`[site-import:persist] DONE slug=${result.draft.slug}`);
  return result;
}

async function failImport(importJobId: string, message: string): Promise<void> {
  "use step";
  await recordImportFailure(importJobId, message);
}

async function enhanceDraftImages(
  draft: PersistableSiteDraft,
  vertical: VerticalId,
): Promise<PersistableSiteDraft> {
  "use step";
  console.log(`[site-import:enhance] START slug=${draft.slug}`);
  if (
    !draft.autoEnhanceImages ||
    !draft.heroImageUrl?.startsWith("https://") ||
    !imageStorageIsConfigured() ||
    (!process.env.VERCEL_OIDC_TOKEN && !process.env.AI_GATEWAY_API_KEY)
  ) {
    console.log(`[site-import:enhance] SKIP slug=${draft.slug}`);
    return draft;
  }

  const originalUrl = draft.heroOriginalImageUrl ?? draft.heroImageUrl;
  try {
    const originalImage = await fetchPublicImage(originalUrl);
    const storedOriginalUrl = await storeSiteImage({
      siteSlug: draft.slug,
      vertical,
      data: originalImage.data,
      mediaType: originalImage.mediaType,
      purpose: "original-hero",
    });
    const image = await enhanceSiteHeroImage(
      {
        sourceImageUrl: storedOriginalUrl,
        siteName: draft.name,
      },
      vertical,
    );
    const heroImageUrl = await storeSiteImage({
      siteSlug: draft.slug,
      vertical,
      data: image.data,
      mediaType: image.mediaType,
      purpose: "hero",
    });
    console.log(`[site-import:enhance] DONE slug=${draft.slug}`);
    return {
      ...draft,
      heroImageUrl,
      heroOriginalImageUrl: storedOriginalUrl,
      heroImageProvenance: draft.heroImageProvenance ?? "official",
    };
  } catch (error) {
    console.warn(
      `[site-import:enhance] FALLBACK slug=${draft.slug} error=${
        error instanceof Error ? error.message : "unknown"
      }`,
    );
    return draft;
  }
}

async function emitComplete(
  persisted: PersistedImport,
  vertical: VerticalId,
): Promise<void> {
  "use step";
  await emit({
    type: "complete",
    draft: persisted.draft,
    vertical,
    importJobId: persisted.importJobId,
    urls: persisted.urls,
  });
}
