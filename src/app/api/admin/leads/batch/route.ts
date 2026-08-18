import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { z } from "zod";
import { getSuperadminAccess } from "@/lib/authorization";
import { getDb } from "@/lib/db";
import { importFailureMessage } from "@/lib/import-identity";
import { leadBatchRequestSchema } from "@/lib/operator-lead-batch";
import {
  createOrReopenOperatorLead,
  OperatorLeadError,
} from "@/lib/operator-leads";
import { limitOperatorLeadBatch } from "@/lib/rate-limit";
import { isSameOriginMutation } from "@/lib/request-origin";
import { leadOutreachWorkflow } from "@/workflows/lead-outreach";

export const runtime = "nodejs";
export const maxDuration = 300;

type LeadBatchResult =
  | {
      source: string;
      siteSlug: string;
      importJobId: string | null;
      created: boolean;
      reopened: boolean;
      workflowRunId: string | null;
    }
  | { source: string; error: string };

/**
 * Runs `createOrReopenOperatorLead` for each lead in the batch sequentially
 * — importing crawls and generates a draft per lead, so running them
 * concurrently would multiply load on the crawler/AI pipeline for no benefit
 * — and, once a lead lands, starts `leadOutreachWorkflow` for it. One lead
 * failing (a bad source URL, an import conflict) does not abort the rest of
 * the batch; its result row carries the error instead.
 */
export async function POST(request: Request) {
  if (!isSameOriginMutation(request, { requireOrigin: true })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const operator = await getSuperadminAccess();
  if (!operator) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rateLimit = await limitOperatorLeadBatch(request);
  if (!rateLimit.success) {
    return NextResponse.json(
      {
        error:
          rateLimit.reason === "unavailable"
            ? "Operator batch imports are temporarily unavailable."
            : "Too many batch imports. Try again later.",
      },
      { status: rateLimit.reason === "unavailable" ? 503 : 429 },
    );
  }

  let input: z.infer<typeof leadBatchRequestSchema>;
  try {
    input = leadBatchRequestSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Check the batch details." },
        { status: 400 },
      );
    }
    throw error;
  }

  const actor = `operator:${operator.id}`;
  const db = getDb();
  const followUpDelayMs = input.followUpDelayHours
    ? input.followUpDelayHours * 60 * 60_000
    : undefined;

  const results: LeadBatchResult[] = [];
  for (const item of input.leads) {
    try {
      const lead = await createOrReopenOperatorLead({
        source: item.source,
        vertical: item.vertical,
        actor,
      });
      if (item.contactEmail) {
        await db.site.update({
          where: { slug: lead.siteSlug },
          data: { email: item.contactEmail },
        });
      }

      let workflowRunId: string | null = null;
      if (input.sendEmail && process.env.WORKFLOW_ENABLED === "true") {
        const site = await db.site.findUniqueOrThrow({
          where: { slug: lead.siteSlug },
          select: { id: true },
        });
        const run = await start(leadOutreachWorkflow, [
          site.id,
          { actor, followUpDelayMs },
        ]);
        workflowRunId = run.runId;
      }

      results.push({
        source: item.source,
        siteSlug: lead.siteSlug,
        importJobId: lead.importJobId,
        created: lead.created,
        reopened: lead.reopened,
        workflowRunId,
      });
    } catch (error) {
      const message =
        error instanceof OperatorLeadError
          ? error.message
          : importFailureMessage(error);
      console.error("[operator-lead-batch] lead failed", {
        operatorId: operator.id,
        source: item.source,
        error: message,
      });
      results.push({ source: item.source, error: message });
    }
  }

  return NextResponse.json(
    { ok: true, results },
    { headers: { "Cache-Control": "no-store" } },
  );
}
