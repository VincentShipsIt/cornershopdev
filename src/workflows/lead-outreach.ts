import { getWritable, sleep } from "workflow";
import { Vertical } from "@/generated/prisma/enums";
import { appOrigin } from "@/lib/app-origin";
import {
  issueClaimInvitation,
  revokeUndeliveredInvitation,
  type IssuedClaimInvitation,
} from "@/lib/claim-invitations";
import { getDb } from "@/lib/db";
import { mutableLeadStatuses } from "@/lib/lead-status";
import { captureOperatorAlert } from "@/lib/operator-alerts";
import { isOperatorReviewCurrent } from "@/lib/operator-lead-status";
import type { OutreachTemplateId } from "@/lib/outreach-templates";

/**
 * `recordOperatorLeadAction` (from `@/lib/operator-leads`) and `sendLeadEmail`
 * (from `@/lib/outreach`) are imported dynamically, inside the step that uses
 * them, rather than statically at module scope. Both modules start with a
 * side-effecting `import "server-only"` and transitively reach the site
 * crawler and Prisma client; a static top-level import here would pull that
 * whole graph into the `"use workflow"` orchestrator bundle, which only
 * tree-shakes cleanly when nothing it imports carries a side-effecting
 * top-level import. `mutableLeadStatuses` and `appOrigin` don't have that
 * problem — they now live in small, dependency-free modules of their own.
 */

/** Wait between the initial preview_ready send and the follow_up_1 send. */
export const DEFAULT_FOLLOW_UP_DELAY_MS = 3 * 24 * 60 * 60_000;

type OutreachStage = "preview_ready" | "follow_up_1";

export type LeadOutreachEvent =
  | { type: "progress"; stage: OutreachStage; message: string }
  | { type: "skipped"; stage: OutreachStage; reason: string }
  | { type: "sent"; stage: OutreachStage; messageId: string }
  | { type: "complete" }
  | { type: "failed"; message: string };

type OutreachStepResult =
  | { status: "sent"; messageId: string }
  | { status: "unknown"; message: string };

export function unknownOutreachStepResult(
  error: unknown,
): Extract<OutreachStepResult, { status: "unknown" }> | null {
  return error instanceof Error && error.name === "OutreachDeliveryUnknownError"
    ? { status: "unknown", message: error.message }
    : null;
}

/**
 * Sends the lead → preview → outreach email → claim invitation sequence for
 * one site: a `preview_ready` email with a stage-stable claim invitation, a
 * wait, then a `follow_up_1` email with its own invitation if the lead is
 * still eligible. Eligibility (mutable lead status, a contact email on file,
 * the `outreach.paused` kill switch) is re-checked before each send rather
 * than once at the start, so an operator pausing outreach or claiming the
 * site mid-flight stops the run at its next step rather than only at launch.
 *
 * Each stage issues its own claim invitation instead of reusing one across
 * the follow-up delay: `CLAIM_INVITATION_TTL_MS` (48h) is shorter than the
 * default follow-up delay (3 days), so a carried-over invitation would already
 * be expired by the time the follow-up email went out.
 */
export async function leadOutreachWorkflow(
  siteId: string,
  options: {
    actor: string;
    dispatchId: string;
    dispatchAttempt: number;
    recipient: string;
    reviewedAt: string;
    followUpDelayMs?: number;
  },
): Promise<void> {
  "use workflow";

  let initialSent = false;
  let providerAcceptanceUnknown = false;
  try {
    const lead = await loadEligibleLead(
      siteId,
      options.recipient,
      options.reviewedAt,
      "preview_ready",
    );
    if (!lead) {
      await finishInitialDispatch(
        options.dispatchId,
        siteId,
        options.actor,
        "FAILED",
        options.dispatchAttempt,
        "The reviewed lead became ineligible before delivery.",
      );
      await emit({
        type: "skipped",
        stage: "preview_ready",
        reason: "Lead is not eligible for outreach.",
      });
      return;
    }

    await emit({
      type: "progress",
      stage: "preview_ready",
      message: "Issuing a claim invitation and sending the preview email",
    });
    const initial = await sendOutreachStep(
      siteId,
      lead.slug,
      lead.email,
      "preview_ready",
      options.actor,
      options.reviewedAt,
      options.dispatchId,
      options.dispatchAttempt,
    );
    if (initial.status === "unknown") {
      providerAcceptanceUnknown = true;
      await alertOutreachFailure(siteId, initial.message);
      await emit({ type: "failed", message: initial.message });
      return;
    }
    await emit({
      type: "sent",
      stage: "preview_ready",
      messageId: initial.messageId,
    });
    initialSent = true;
    await finishInitialDispatch(
      options.dispatchId,
      siteId,
      options.actor,
      "SENT",
      options.dispatchAttempt,
    );

    const delayMs = options.followUpDelayMs ?? DEFAULT_FOLLOW_UP_DELAY_MS;
    await sleep(delayMs);

    const stillEligible = await loadEligibleLead(
      siteId,
      options.recipient,
      options.reviewedAt,
      "follow_up_1",
    );
    if (!stillEligible) {
      await emit({
        type: "skipped",
        stage: "follow_up_1",
        reason: "Lead is no longer eligible for outreach.",
      });
      await emit({ type: "complete" });
      return;
    }

    await emit({
      type: "progress",
      stage: "follow_up_1",
      message: "Issuing a claim invitation and sending the follow-up email",
    });
    const followUp = await sendOutreachStep(
      siteId,
      stillEligible.slug,
      stillEligible.email,
      "follow_up_1",
      options.actor,
      options.reviewedAt,
      options.dispatchId,
      options.dispatchAttempt,
    );
    if (followUp.status === "unknown") {
      providerAcceptanceUnknown = true;
      await alertOutreachFailure(siteId, followUp.message);
      await emit({ type: "failed", message: followUp.message });
      return;
    }
    await emit({
      type: "sent",
      stage: "follow_up_1",
      messageId: followUp.messageId,
    });
    await emit({ type: "complete" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Lead outreach failed.";
    if (!initialSent && !providerAcceptanceUnknown) {
      await finishInitialDispatch(
        options.dispatchId,
        siteId,
        options.actor,
        "FAILED",
        options.dispatchAttempt,
        message,
      );
    }
    await alertOutreachFailure(siteId, message);
    await emit({ type: "failed", message });
    throw error;
  }
}

async function emit(event: LeadOutreachEvent): Promise<void> {
  "use step";
  const writer = getWritable<LeadOutreachEvent>().getWriter();
  try {
    await writer.write(event);
  } finally {
    writer.releaseLock();
  }
}

/**
 * Pure eligibility predicate, kept separate from `loadEligibleLead`'s DB
 * reads so it can be unit tested without a database. A site is eligible when
 * its status is one a lead can hold (not already claimed/live), it has a
 * contact email on file, and the operator kill switch is not set. Reused for
 * both the initial-eligibility check and the pre-follow-up re-check so the
 * two never drift.
 */
export function isLeadEligibleForOutreach(
  site: { status: string; email: string | null } | null,
  paused: boolean,
  latestOutreachStatus: string | null = null,
): boolean {
  if (!site || !mutableLeadStatuses.has(site.status) || !site.email) {
    return false;
  }
  if (paused) return false;
  return (
    latestOutreachStatus === null ||
    latestOutreachStatus === "SENT" ||
    latestOutreachStatus === "DELIVERED"
  );
}

async function loadEligibleLead(
  siteId: string,
  expectedRecipient: string,
  expectedReviewedAt: string,
  stage: OutreachStage,
): Promise<{ slug: string; email: string } | null> {
  "use step";
  return readEligibleLead(
    siteId,
    expectedRecipient,
    expectedReviewedAt,
    stage,
  );
}

async function readEligibleLead(
  siteId: string,
  expectedRecipient: string,
  expectedReviewedAt: string,
  stage: OutreachStage,
): Promise<{ slug: string; email: string } | null> {
  const db = getDb();
  const [site, setting] = await Promise.all([
    db.site.findUnique({
      where: { id: siteId },
      select: {
        slug: true,
        email: true,
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
          where: {
            direction: "OUTBOUND",
            template: "preview_ready",
          },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true },
        },
      },
    }),
    db.operatorSetting.findUnique({ where: { key: "outreach.paused" } }),
  ]);
  const paused = setting?.value === true;
  if (
    !isLeadEligibleForOutreach(
      site,
      paused,
      stage === "follow_up_1"
        ? (site?.outreachMessages[0]?.status ?? null)
        : null,
    ) ||
    !isReviewedRestofrontLead(
      site,
      paused,
      expectedRecipient,
      expectedReviewedAt,
    )
  ) {
    return null;
  }
  // Non-null by construction: `isLeadEligibleForOutreach` only returns true
  // when `site` and `site.email` are both non-null.
  return { slug: site!.slug, email: expectedRecipient.trim().toLowerCase() };
}

export function isReviewedRestofrontLead(
  site: {
    email: string | null;
    status: string;
    vertical: string;
    updatedAt: Date;
    auditEvents: Array<{ createdAt: Date }>;
  } | null,
  paused: boolean,
  expectedRecipient: string,
  expectedReviewedAt: string,
): boolean {
  const latestReview = site?.auditEvents[0]?.createdAt ?? null;
  return Boolean(
    site &&
      !paused &&
      site.vertical === Vertical.RESTAURANT &&
      mutableLeadStatuses.has(site.status) &&
      site.email?.trim().toLowerCase() ===
        expectedRecipient.trim().toLowerCase() &&
      latestReview?.toISOString() === expectedReviewedAt &&
      isOperatorReviewCurrent(latestReview, site.updatedAt),
  );
}

/**
 * Issues the stage-stable claim invitation, sends the templated email against
 * it, and logs the send as an operator note. Only an actual delivery failure
 * revokes the invitation; a later note failure must not invalidate a token
 * that is already in a recipient's mailbox.
 */
async function sendOutreachStep(
  siteId: string,
  siteSlug: string,
  email: string,
  template: OutreachTemplateId,
  actor: string,
  expectedReviewedAt: string,
  dispatchId: string,
  outreachAttempt: number,
): Promise<OutreachStepResult> {
  "use step";
  const current = await readEligibleLead(
    siteId,
    email,
    expectedReviewedAt,
    template,
  );
  if (!current) {
    throw new Error("The reviewed lead became ineligible before delivery.");
  }
  const {
    sendLeadEmail,
    OutreachDeliveryUnknownError,
    OutreachTerminalDeliveryError,
  } = await import("@/lib/outreach");
  const { recordOperatorLeadAction } = await import("@/lib/operator-leads");
  const invitation = await issueClaimInvitation({
    siteSlug,
    email,
    proofMethod: "OPERATOR_APPROVAL",
    actor,
    outreachKey: `lead-outreach:${siteId}:${template}`,
    outreachDispatch: {
      id: dispatchId,
      attempt: outreachAttempt,
      recipient: email,
      reviewedAt: expectedReviewedAt,
      stage: template,
    },
  });
  const claimUrl = buildClaimUrl(invitation);
  let sent: Awaited<ReturnType<typeof sendLeadEmail>>;
  try {
    sent = await sendLeadEmail({
      siteId,
      template,
      claimUrl,
      to: email,
      actor,
      expectedReviewedAt,
      claimInvitationId: invitation.id,
      dispatchAuthorization: {
        dispatchId,
        attempt: outreachAttempt,
      },
    });
  } catch (error) {
    const unknown =
      error instanceof OutreachDeliveryUnknownError
        ? { status: "unknown" as const, message: error.message }
        : unknownOutreachStepResult(error);
    if (unknown) {
      // Workflow serializes a thrown step error as a generic FatalError after
      // retries, which would erase this distinction in the orchestrator. Keep
      // UNKNOWN as a typed step result so the durable QUEUED mailbox and its
      // provider idempotency key can never be mistaken for a definite failure.
      return unknown;
    }
    if (error instanceof OutreachTerminalDeliveryError) {
      await revokeUndeliveredInvitation(invitation);
    }
    throw error;
  }
  if (!sent.deduplicated) {
    try {
      await recordOperatorLeadAction({
        siteSlug,
        action: "add_note",
        note: `Sent ${template} outreach email.`,
        actor,
      });
    } catch (error) {
      console.error("[lead-outreach] post-send note failed", {
        siteId,
        template,
        messageId: sent.id,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }
  return { status: "sent", messageId: sent.id };
}

async function finishInitialDispatch(
  dispatchId: string,
  siteId: string,
  actor: string,
  status: "SENT" | "FAILED",
  attempt: number,
  error?: string,
): Promise<void> {
  "use step";
  const { markInitialOutreachDispatchFinished } = await import(
    "@/lib/outreach-dispatch"
  );
  await markInitialOutreachDispatchFinished({
    dispatchId,
    siteId,
    actor,
    status,
    attempt,
    error,
  });
}

/**
 * Mirrors `deliverClaimInvitation`'s claim-URL construction: the token lives
 * in the fragment so it is never sent in HTTP requests or Referer headers.
 */
function buildClaimUrl(invitation: IssuedClaimInvitation): string {
  const claimUrl = new URL(
    `/claim/${encodeURIComponent(invitation.site.slug)}`,
    appOrigin(),
  );
  claimUrl.hash = new URLSearchParams({
    claim_token: invitation.token,
  }).toString();
  return claimUrl.toString();
}

async function alertOutreachFailure(
  siteId: string,
  message: string,
): Promise<void> {
  "use step";
  await captureOperatorAlert({
    kind: "OUTREACH_SEND_FAILURE",
    dedupKey: `workflow:${siteId}`,
    title: "Lead outreach workflow failed",
    message,
    context: { siteId },
  });
}
