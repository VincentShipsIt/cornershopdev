import { getWritable } from "workflow";
import type { SiteFacts } from "@/lib/articles/site-facts";
import type { GeneratedArticleDraft } from "@/lib/articles/composer";

/**
 * Durable article-batch generation for one site.
 *
 * Same shape as `leadOutreachWorkflow`: the orchestrator only coordinates —
 * every DB read/write and model call is a `"use step"` so a crash between
 * steps resumes instead of re-running. The generation library is imported
 * dynamically inside steps because it transitively reaches Prisma and the AI
 * SDK, which must not enter the orchestrator bundle (see the note at the top
 * of `lead-outreach.ts`). The `SiteFacts`/`GeneratedArticleDraft` imports here
 * are type-only and vanish at build time.
 */

export type ArticleBatchEvent =
  | { type: "progress"; message: string }
  | { type: "skipped"; reason: string }
  | { type: "complete"; batchId: string; producedCount: number }
  | { type: "failed"; message: string };

export async function articleBatchWorkflow(input: {
  siteId: string;
  requestedBy: string;
  count?: number;
}): Promise<void> {
  "use workflow";

  try {
    const loaded = await loadInputsStep(input.siteId);
    if (!loaded.ok) {
      await emit({ type: "skipped", reason: loaded.reason });
      return;
    }

    await emit({ type: "progress", message: "Selecting topics" });
    const drafts = await generateDraftsStep({
      facts: loaded.facts,
      recentTopicKeys: loaded.recentTopicKeys,
      count: input.count ?? 4,
    });
    if (!drafts.length) {
      await emit({
        type: "skipped",
        reason: "No supportable topic produced an acceptable draft.",
      });
      return;
    }

    const persisted = await persistBatchStep({
      siteId: input.siteId,
      requestedBy: input.requestedBy,
      facts: loaded.facts,
      drafts,
    });

    await emit({
      type: "complete",
      batchId: persisted.batchId,
      producedCount: persisted.producedCount,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Article batch failed.";
    await emit({ type: "failed", message });
    throw error;
  }
}

async function emit(event: ArticleBatchEvent): Promise<void> {
  "use step";
  const writer = getWritable<ArticleBatchEvent>().getWriter();
  try {
    await writer.write(event);
  } finally {
    writer.releaseLock();
  }
}

async function loadInputsStep(
  siteId: string,
): Promise<
  | { ok: true; facts: SiteFacts; recentTopicKeys: string[] }
  | { ok: false; reason: string }
> {
  "use step";
  const { loadGenerationInputs } = await import("@/lib/articles/generation");
  return loadGenerationInputs(siteId);
}

async function generateDraftsStep(input: {
  facts: SiteFacts;
  recentTopicKeys: string[];
  count: number;
}): Promise<GeneratedArticleDraft[]> {
  "use step";
  const { generateBatchDrafts } = await import("@/lib/articles/generation");
  return generateBatchDrafts(input);
}

async function persistBatchStep(input: {
  siteId: string;
  requestedBy: string;
  facts: SiteFacts;
  drafts: GeneratedArticleDraft[];
}): Promise<{ batchId: string; producedCount: number }> {
  "use step";
  const { persistArticleBatch } = await import("@/lib/articles/generation");
  return persistArticleBatch(input);
}
