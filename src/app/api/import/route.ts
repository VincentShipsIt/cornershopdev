import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { z } from "zod";
import { Vertical } from "@/generated/prisma/enums";
import { limitPublicPreview } from "@/lib/rate-limit";
import { importFailureMessage } from "@/lib/restaurant-import";
import {
  createImportJob,
  ImportConflictError,
  ImportDatabaseUnavailableError,
  persistSiteImport,
  recordImportFailure,
  updateImportJob,
  type PersistableSiteDraft,
} from "@/lib/site-persistence";
import { crawlSiteSource, generateDraftForVertical } from "@/lib/site-pipeline";
import { siteImportWorkflow } from "@/workflows/site-import";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  source: z.string().trim().min(2).max(500),
  vertical: z.enum(Vertical).default(Vertical.RESTAURANT),
});

export async function POST(request: Request) {
  let importJobId: string | null = null;

  try {
    const { source, vertical } = requestSchema.parse(await request.json());
    const rateLimit = await limitPublicPreview(request);
    if (!rateLimit.success) {
      const unavailable = rateLimit.reason === "unavailable";
      return NextResponse.json(
        {
          error: unavailable
            ? "Preview generation is temporarily unavailable"
            : "Too many previews from this connection. Try again later.",
        },
        {
          status: unavailable ? 503 : 429,
          headers: {
            "X-RateLimit-Remaining": String(rateLimit.remaining),
            "X-RateLimit-Reset": String(rateLimit.reset),
          },
        },
      );
    }

    const importJob = await createImportJob(source, vertical);
    importJobId = importJob.id;

    if (process.env.WORKFLOW_ENABLED === "true") {
      const run = await start(siteImportWorkflow, [
        source,
        importJob.id,
        vertical,
      ]);
      await updateImportJob(importJob.id, { workflowRunId: run.runId });
      return NextResponse.json({
        mode: "workflow",
        runId: run.runId,
        importJobId: importJob.id,
      });
    }

    await updateImportJob(importJob.id, { status: "CRAWLING" });
    const extracted = await crawlSiteSource(source, vertical);
    await updateImportJob(importJob.id, { status: "EXTRACTING" });
    await updateImportJob(importJob.id, { status: "GENERATING" });
    const draft = await generateDraftForVertical(extracted, vertical);
    const persisted = await persistSiteImport<PersistableSiteDraft>({
      draft,
      vertical,
      source,
      importJobId: importJob.id,
    });
    return NextResponse.json({
      mode: "inline",
      vertical,
      ...persisted,
    });
  } catch (error) {
    if (importJobId) {
      try {
        await recordImportFailure(importJobId, error);
      } catch (recordError) {
        console.error("[site-import] failed to record import error", {
          importJobId,
          error:
            recordError instanceof Error ? recordError.message : "unknown",
        });
      }
    }

    const status =
      error instanceof ImportDatabaseUnavailableError
        ? 503
        : error instanceof ImportConflictError
          ? 409
          : 400;
    const message = importFailureMessage(error);
    return NextResponse.json({ error: message, importJobId }, { status });
  }
}
