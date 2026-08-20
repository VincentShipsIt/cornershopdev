import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { z } from "zod";
import { Vertical } from "@/generated/prisma/enums";
import { getSuperadminAccess } from "@/lib/authorization";
import { getDb } from "@/lib/db";
import { mutableLeadStatuses } from "@/lib/lead-status";
import {
  markInitialOutreachDispatchFinished,
  markInitialOutreachDispatchStarted,
  reserveInitialOutreachDispatch,
} from "@/lib/outreach-dispatch";
import { isOperatorReviewCurrent } from "@/lib/operator-lead-status";
import { isOutreachMessageRetryable } from "@/lib/outreach-delivery-policy";
import { evaluateOutreachEnvironment } from "@/lib/outreach-readiness";
import {
  listOutreachMessages,
  OutreachError,
  sendLeadEmail,
} from "@/lib/outreach";
import { limitOperatorOutreachSend } from "@/lib/rate-limit";
import { isSameOriginMutation } from "@/lib/request-origin";
import { leadOutreachWorkflow } from "@/workflows/lead-outreach";

export const runtime = "nodejs";

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("send_initial"),
    recipient: z
      .string()
      .trim()
      .email()
      .transform((value) => value.toLowerCase()),
    reviewedAt: z.string().datetime({ offset: true }),
  }),
  z.object({
    action: z.literal("reply"),
    body: z.string().trim().min(1).max(8000),
    inReplyToMessageId: z.string().trim().min(1).optional(),
  }),
]);

/**
 * Read-only, so unlike the mutating routes in `admin/leads` and
 * `admin/outreach` this does not call `isSameOriginMutation` — that guard
 * exists to stop cross-site state changes and has nothing to check on a GET.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/admin/leads/[slug]/outreach">,
) {
  const operator = await getSuperadminAccess();
  if (!operator) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { slug } = await params;
  const site = await getDb().site.findUnique({
    where: { slug },
    select: { id: true, status: true },
  });
  if (!site) {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }

  const messages = await listOutreachMessages(site.id);
  return NextResponse.json(
    {
      ok: true,
      status: site.status,
      messages: messages.map((message) => ({
        id: message.id,
        direction: message.direction,
        template: message.template,
        subject: message.subject,
        textBody: message.textBody,
        toAddress: message.toAddress,
        fromAddress: message.fromAddress,
        status: message.status,
        error: message.error,
        inReplyTo: message.inReplyTo,
        threadKey: message.threadKey,
        sentAt: message.sentAt?.toISOString() ?? null,
        deliveredAt: message.deliveredAt?.toISOString() ?? null,
        receivedAt: message.receivedAt?.toISOString() ?? null,
        createdAt: message.createdAt.toISOString(),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/admin/leads/[slug]/outreach">,
) {
  if (!isSameOriginMutation(request, { requireOrigin: true })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const operator = await getSuperadminAccess();
  if (!operator) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rateLimit = await limitOperatorOutreachSend(request);
  if (!rateLimit.success) {
    return NextResponse.json(
      {
        error:
          rateLimit.reason === "unavailable"
            ? "Outreach controls are temporarily unavailable."
            : "Too many outreach requests. Try again later.",
      },
      { status: rateLimit.reason === "unavailable" ? 503 : 429 },
    );
  }

  try {
    const input = requestSchema.parse(await request.json());
    const { slug } = await params;
    const db = getDb();
    if (input.action === "reply") {
      return sendOperatorThreadReply({
        slug,
        operatorId: operator.id,
        body: input.body,
        inReplyToMessageId: input.inReplyToMessageId,
      });
    }
    const site = await db.site.findUnique({
      where: { slug },
      select: {
        id: true,
        leadContactEmail: true,
        status: true,
        vertical: true,
        updatedAt: true,
        auditEvents: {
          where: { type: "site.review.completed" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
        outreachMessages: {
          where: { direction: "OUTBOUND", template: "preview_ready" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            providerEventAt: true,
            createdAt: true,
          },
        },
      },
    });
    if (!site) {
      return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    }
    if (
      site.vertical !== Vertical.RESTAURANT ||
      !mutableLeadStatuses.has(site.status) ||
      !site.leadContactEmail
    ) {
      return NextResponse.json(
        { error: "This lead is not eligible for outreach." },
        { status: 409 },
      );
    }
    const recipient = site.leadContactEmail.trim().toLowerCase();
    const reviewedAt = site.auditEvents[0]?.createdAt ?? null;
    if (!reviewedAt || !isOperatorReviewCurrent(reviewedAt, site.updatedAt)) {
      return NextResponse.json(
        { error: "Review the current preview before sending outreach." },
        { status: 409 },
      );
    }
    if (
      input.recipient !== recipient ||
      input.reviewedAt !== reviewedAt.toISOString()
    ) {
      return NextResponse.json(
        {
          error:
            "The contact or reviewed preview changed. Refresh and confirm again.",
        },
        { status: 409 },
      );
    }

    const existing = site.outreachMessages[0];
    const retryableInitial = existing
      ? isOutreachMessageRetryable(existing)
      : false;
    if (existing && !retryableInitial) {
      return NextResponse.json(
        {
          ok: true,
          started: false,
          messageId: existing.id,
          status: existing.status,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const paused = await db.operatorSetting.findUnique({
      where: { key: "outreach.paused" },
      select: { value: true },
    });
    if (paused?.value === true) {
      return NextResponse.json(
        { error: "Outreach is paused." },
        { status: 409 },
      );
    }
    if (!evaluateOutreachEnvironment(process.env).ready) {
      return NextResponse.json(
        { error: "Outreach is not production-ready. Run the preflight." },
        { status: 503 },
      );
    }

    const actor = `operator:${operator.id}`;
    const dispatch = await reserveInitialOutreachDispatch({
      siteId: site.id,
      recipient,
      reviewedAt,
      actor,
    });
    if (!dispatch.acquired) {
      return NextResponse.json(
        {
          ok: true,
          started: false,
          dispatchId: dispatch.id,
          workflowRunId: dispatch.workflowRunId,
          status: dispatch.status,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    let run: Awaited<ReturnType<typeof start>>;
    try {
      run = await start(leadOutreachWorkflow, [
        site.id,
        {
          actor,
          dispatchId: dispatch.id,
          dispatchAttempt: dispatch.attempt,
          recipient,
          reviewedAt: reviewedAt.toISOString(),
        },
      ]);
    } catch (error) {
      await markInitialOutreachDispatchFinished({
        dispatchId: dispatch.id,
        siteId: site.id,
        actor,
        status: "FAILED",
        attempt: dispatch.attempt,
        error: "Workflow could not be started.",
      });
      throw error;
    }
    try {
      await markInitialOutreachDispatchStarted({
        dispatchId: dispatch.id,
        siteId: site.id,
        workflowRunId: run.runId,
        actor,
        attempt: dispatch.attempt,
      });
    } catch (error) {
      console.error("[operator-outreach] queue audit failed", {
        operatorId: operator.id,
        dispatchId: dispatch.id,
        workflowRunId: run.runId,
        error: error instanceof Error ? error.message : "unknown",
      });
    }

    return NextResponse.json(
      {
        ok: true,
        started: true,
        dispatchId: dispatch.id,
        workflowRunId: run.runId,
        status: "QUEUED",
      },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid outreach request." },
        { status: 400 },
      );
    }
    console.error("[operator-outreach] failed", {
      operatorId: operator.id,
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "Outreach could not be queued." },
      { status: 503 },
    );
  }
}

async function sendOperatorThreadReply(input: {
  slug: string;
  operatorId: string;
  body: string;
  inReplyToMessageId?: string;
}) {
  if (!evaluateOutreachEnvironment(process.env).ready) {
    return NextResponse.json(
      { error: "Outreach is not production-ready. Run the preflight." },
      { status: 503 },
    );
  }
  const site = await getDb().site.findUnique({
    where: { slug: input.slug },
    select: {
      id: true,
      leadContactEmail: true,
      vertical: true,
      status: true,
    },
  });
  if (!site) {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }
  if (site.vertical !== Vertical.RESTAURANT || !site.leadContactEmail) {
    return NextResponse.json(
      { error: "This lead is not eligible for outreach." },
      { status: 409 },
    );
  }
  try {
    const sent = await sendLeadEmail({
      siteId: site.id,
      template: "operator_reply",
      body: input.body,
      actor: `operator:${input.operatorId}`,
      inReplyToMessageId: input.inReplyToMessageId,
    });
    return NextResponse.json(
      {
        ok: true,
        started: false,
        messageId: sent.id,
        status: sent.status,
        deduplicated: sent.deduplicated,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof OutreachError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    throw error;
  }
}
