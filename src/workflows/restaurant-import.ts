import { getWritable } from "workflow";
import {
  enhanceRestaurantImage,
  generateRestaurantDraft,
} from "@/lib/ai/restaurant-generation";
import {
  fetchPublicImage,
  inspectSource,
  type ExtractedRestaurant,
} from "@/lib/importer";
import type { RestaurantDraft } from "@/lib/restaurant";
import { importFailureMessage } from "@/lib/restaurant-import";
import {
  persistRestaurantImport,
  recordImportFailure,
  updateImportJob,
  type PersistedRestaurantImport,
} from "@/lib/restaurant-import-persistence";
import {
  imageStorageIsConfigured,
  storeSiteImage,
} from "@/lib/storage/images";

export type RestaurantImportEvent =
  | {
      type: "progress";
      stage: "crawl" | "extract" | "compose" | "persist";
      progress: number;
      message: string;
    }
  | {
      type: "complete";
      draft: RestaurantDraft;
      importJobId: string;
      urls: PersistedRestaurantImport["urls"];
    }
  | { type: "failed"; message: string };

export async function restaurantImportWorkflow(
  source: string,
  importJobId: string,
): Promise<RestaurantDraft> {
  "use workflow";

  try {
    console.log(`[restaurant-import] START job=${importJobId}`);
    await setImportStage(importJobId, "CRAWLING");
    await emit({
      type: "progress",
      stage: "crawl",
      progress: 12,
      message: "Reading the current website",
    });
    const extracted = await crawlRestaurant(source);
    await setImportStage(importJobId, "EXTRACTING");
    await emit({
      type: "progress",
      stage: "extract",
      progress: 42,
      message: "Recovering menu, contacts and existing links",
    });
    await setImportStage(importJobId, "GENERATING");
    await emit({
      type: "progress",
      stage: "compose",
      progress: 65,
      message: "Composing the mobile-first preview",
    });
    const draft = await composeDraft(extracted);
    const enhancedDraft = await enhanceDraftImages(draft);
    await emit({
      type: "progress",
      stage: "compose",
      progress: 88,
      message: "Checking every photo, menu and integration",
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
    );
    await emitComplete(persisted);
    console.log(`[restaurant-import] DONE slug=${persisted.draft.slug}`);
    return persisted.draft;
  } catch (error) {
    const message = importFailureMessage(error);
    await failImport(importJobId, message);
    await emit({ type: "failed", message });
    throw error;
  }
}

async function emit(event: RestaurantImportEvent): Promise<void> {
  "use step";
  const writer = getWritable<RestaurantImportEvent>().getWriter();
  try {
    await writer.write(event);
  } finally {
    writer.releaseLock();
  }
}

async function crawlRestaurant(source: string): Promise<ExtractedRestaurant> {
  "use step";
  console.log(`[restaurant-import:crawl] START source=${source}`);
  const result = await inspectSource(source);
  console.log(
    `[restaurant-import:crawl] DONE name=${result.name} links=${result.links.length}`,
  );
  return result;
}

async function composeDraft(
  source: ExtractedRestaurant,
): Promise<RestaurantDraft> {
  "use step";
  console.log(`[restaurant-import:compose] START name=${source.name}`);
  const draft = await generateRestaurantDraft(source);
  console.log(
    `[restaurant-import:compose] DONE slug=${draft.slug} sections=${draft.menuSections.length}`,
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
  draft: RestaurantDraft,
  source: string,
  importJobId: string,
): Promise<PersistedRestaurantImport> {
  "use step";
  console.log(`[restaurant-import:persist] START slug=${draft.slug}`);
  const result = await persistRestaurantImport({
    draft,
    source,
    importJobId,
  });
  console.log(`[restaurant-import:persist] DONE slug=${result.draft.slug}`);
  return result;
}

async function failImport(
  importJobId: string,
  message: string,
): Promise<void> {
  "use step";
  await recordImportFailure(importJobId, message);
}

async function enhanceDraftImages(
  draft: RestaurantDraft,
): Promise<RestaurantDraft> {
  "use step";
  console.log(`[restaurant-import:enhance] START slug=${draft.slug}`);
  if (
    !draft.autoEnhanceImages ||
    !draft.heroImageUrl?.startsWith("https://") ||
    !imageStorageIsConfigured() ||
    (!process.env.VERCEL_OIDC_TOKEN && !process.env.AI_GATEWAY_API_KEY)
  ) {
    console.log(`[restaurant-import:enhance] SKIP slug=${draft.slug}`);
    return draft;
  }

  const originalUrl = draft.heroOriginalImageUrl ?? draft.heroImageUrl;
  try {
    const originalImage = await fetchPublicImage(originalUrl);
    const storedOriginalUrl = await storeSiteImage({
      siteSlug: draft.slug,
      data: originalImage.data,
      mediaType: originalImage.mediaType,
      purpose: "original-hero",
    });
    const image = await enhanceRestaurantImage({
      sourceImageUrl: storedOriginalUrl,
      restaurantName: draft.name,
    });
    const heroImageUrl = await storeSiteImage({
      siteSlug: draft.slug,
      data: image.data,
      mediaType: image.mediaType,
      purpose: "hero",
    });
    console.log(`[restaurant-import:enhance] DONE slug=${draft.slug}`);
    return {
      ...draft,
      heroImageUrl,
      heroOriginalImageUrl: storedOriginalUrl,
      heroImageProvenance: draft.heroImageProvenance ?? "official",
    };
  } catch (error) {
    console.warn(
      `[restaurant-import:enhance] FALLBACK slug=${draft.slug} error=${
        error instanceof Error ? error.message : "unknown"
      }`,
    );
    return draft;
  }
}

async function emitComplete(
  persisted: PersistedRestaurantImport,
): Promise<void> {
  "use step";
  await emit({
    type: "complete",
    draft: persisted.draft,
    importJobId: persisted.importJobId,
    urls: persisted.urls,
  });
}
