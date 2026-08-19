import { NextResponse } from "next/server";
import { z } from "zod";
import { getSuperadminAccess } from "@/lib/authorization";
import { importFailureMessage } from "@/lib/import-identity";
import { leadBatchRequestSchema } from "@/lib/operator-lead-batch";
import {
  createOrReopenOperatorLead,
  OperatorLeadError,
} from "@/lib/operator-leads";
import { limitOperatorLeadBatch } from "@/lib/rate-limit";
import { isSameOriginMutation } from "@/lib/request-origin";

export const runtime = "nodejs";
export const maxDuration = 300;

type LeadBatchResult =
  | {
      source: string;
      siteSlug: string;
      importJobId: string | null;
      created: boolean;
      reopened: boolean;
    }
  | { source: string; error: string };

/**
 * Runs `createOrReopenOperatorLead` for each lead in the batch sequentially
 * — importing crawls and generates a draft per lead, so running them
 * concurrently would multiply load on the crawler/AI pipeline for no benefit
 * One lead failing (a bad source URL, an import conflict) does not abort the
 * rest of the batch; its result row carries the error instead. Creation never
 * starts outreach: the operator must review the resulting preview and use the
 * dedicated per-lead send action.
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
  const results: LeadBatchResult[] = [];
  for (const item of input.leads) {
    try {
      const lead = await createOrReopenOperatorLead({
        source: item.source,
        vertical: item.vertical,
        actor,
        contactEmail: item.contactEmail,
      });

      results.push({
        source: item.source,
        siteSlug: lead.siteSlug,
        importJobId: lead.importJobId,
        created: lead.created,
        reopened: lead.reopened,
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
