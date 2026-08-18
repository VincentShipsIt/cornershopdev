import { getWritable, sleep } from "workflow";
import { appOrigin } from "@/lib/app-origin";
import {
  issueClaimInvitation,
  revokeUndeliveredInvitation,
  type IssuedClaimInvitation,
} from "@/lib/claim-invitations";
import { getDb } from "@/lib/db";
import { mutableLeadStatuses } from "@/lib/lead-status";
import { captureOperatorAlert } from "@/lib/operator-alerts";
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

/**
 * Sends the lead → preview → outreach email → claim invitation sequence for
 * one site: a `preview_ready` email with a fresh claim invitation, a wait,
 * then a `follow_up_1` email with its own fresh invitation if the lead is
 * still eligible. Eligibility (mutable lead status, a contact email on file,
 * the `outreach.paused` kill switch) is re-checked before each send rather
 * than once at the start, so an operator pausing outreach or claiming the
 * site mid-flight stops the run at its next step rather than only at launch.
 *
 * Each send issues its own claim invitation instead of reusing one across the
 * follow-up delay: `CLAIM_INVITATION_TTL_MS` (48h) is shorter than the
 * default follow-up delay (3 days), so a carried-over invitation would already
 * be expired by the time the follow-up email went out.
 */
export async function leadOutreachWorkflow(
  siteId: string,
  options: { actor: string; followUpDelayMs?: number },
): Promise<void> {
  "use workflow";

  try {
    const lead = await loadEligibleLead(siteId);
    if (!lead) {
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
    );
    await emit({
      type: "sent",
      stage: "preview_ready",
      messageId: initial.messageId,
    });

    const delayMs = options.followUpDelayMs ?? DEFAULT_FOLLOW_UP_DELAY_MS;
    await sleep(delayMs);

    const stillEligible = await loadEligibleLead(siteId);
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
    );
    await emit({
      type: "sent",
      stage: "follow_up_1",
      messageId: followUp.messageId,
    });
    await emit({ type: "complete" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Lead outreach failed.";
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
): boolean {
  if (!site || !mutableLeadStatuses.has(site.status) || !site.email) {
    return false;
  }
  return !paused;
}

async function loadEligibleLead(
  siteId: string,
): Promise<{ slug: string; email: string } | null> {
  "use step";
  const db = getDb();
  const [site, setting] = await Promise.all([
    db.site.findUnique({
      where: { id: siteId },
      select: { slug: true, email: true, status: true },
    }),
    db.operatorSetting.findUnique({ where: { key: "outreach.paused" } }),
  ]);
  const paused = setting?.value === true;
  if (!isLeadEligibleForOutreach(site, paused)) return null;
  // Non-null by construction: `isLeadEligibleForOutreach` only returns true
  // when `site` and `site.email` are both non-null.
  return { slug: site!.slug, email: site!.email! };
}

/**
 * Issues a fresh claim invitation, sends the templated email against it, and
 * logs the send as an operator note. If the send fails, the invitation is
 * revoked so it never sits unusable in front of the lead; the error is then
 * rethrown so the caller (the workflow body) can fail the run.
 */
async function sendOutreachStep(
  siteId: string,
  siteSlug: string,
  email: string,
  template: OutreachTemplateId,
  actor: string,
): Promise<{ messageId: string }> {
  "use step";
  const { sendLeadEmail } = await import("@/lib/outreach");
  const { recordOperatorLeadAction } = await import("@/lib/operator-leads");
  const invitation = await issueClaimInvitation({
    siteSlug,
    email,
    proofMethod: "OPERATOR_APPROVAL",
    actor,
  });
  const claimUrl = buildClaimUrl(invitation);
  try {
    const sent = await sendLeadEmail({
      siteId,
      template,
      claimUrl,
      to: email,
      actor,
    });
    await recordOperatorLeadAction({
      siteSlug,
      action: "add_note",
      note: `Sent ${template} outreach email.`,
      actor,
    });
    return { messageId: sent.id };
  } catch (error) {
    await revokeUndeliveredInvitation(invitation);
    throw error;
  }
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
