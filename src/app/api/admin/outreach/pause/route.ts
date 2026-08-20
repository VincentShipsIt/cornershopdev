import { NextResponse } from "next/server";
import { z } from "zod";
import { getSuperadminAccess } from "@/lib/authorization";
import { getDb } from "@/lib/db";
import {
  lockOutreachDelivery,
  lockOutreachSite,
} from "@/lib/outreach-lock";
import {
  GLOBAL_OUTREACH_PAUSE_KEY,
  siteOutreachPauseKey,
} from "@/lib/outreach-pause";
import { limitOperatorOutreachPause } from "@/lib/rate-limit";
import { isSameOriginMutation } from "@/lib/request-origin";

export const runtime = "nodejs";

const requestSchema = z.object({
  paused: z.boolean(),
  siteSlug: z.string().trim().min(1).max(200).optional(),
});

/**
 * Flips the global or per-lead operator kill switch that
 * `leadOutreachWorkflow` re-checks before every send. Upserted because neither
 * scope has seed rows — the first explicit pause/resume creates the setting.
 */
export async function POST(request: Request) {
  if (!isSameOriginMutation(request, { requireOrigin: true })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const operator = await getSuperadminAccess();
  if (!operator) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rateLimit = await limitOperatorOutreachPause(request);
  if (!rateLimit.success) {
    return NextResponse.json(
      {
        error:
          rateLimit.reason === "unavailable"
            ? "Outreach controls are temporarily unavailable."
            : "Too many requests. Try again later.",
      },
      { status: rateLimit.reason === "unavailable" ? 503 : 429 },
    );
  }

  try {
    const input = requestSchema.parse(await request.json());
    const db = getDb();
    const site = input.siteSlug
      ? await db.site.findUnique({
          where: { slug: input.siteSlug },
          select: { id: true },
        })
      : null;
    if (input.siteSlug && !site) {
      return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    }
    const key = site
      ? siteOutreachPauseKey(site.id)
      : GLOBAL_OUTREACH_PAUSE_KEY;
    await db.$transaction(
      async (transaction) => {
        await lockOutreachDelivery(transaction);
        if (site) await lockOutreachSite(transaction, site.id);
        await transaction.operatorSetting.upsert({
          where: { key },
          update: { value: input.paused, updatedBy: operator.id },
          create: {
            key,
            value: input.paused,
            updatedBy: operator.id,
          },
        });
        await transaction.operatorAuditEvent.create({
          data: {
            type: input.paused ? "outreach.paused" : "outreach.resumed",
            actor: `operator:${operator.id}`,
            metadata: {
              paused: input.paused,
              scope: site ? "lead" : "global",
              siteId: site?.id ?? null,
            },
          },
        });
      },
      { maxWait: 5_000, timeout: 20_000 },
    );
    return NextResponse.json(
      { ok: true, paused: input.paused, scope: site ? "lead" : "global" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid request." },
        { status: 400 },
      );
    }
    console.error("[operator-outreach-pause] failed", {
      operatorId: operator.id,
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "Could not update outreach settings." },
      { status: 503 },
    );
  }
}
