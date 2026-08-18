import "server-only";
import type { OutreachMessage } from "@/generated/prisma/client";
import type { OutreachStatus } from "@/generated/prisma/enums";
import { appOrigin } from "@/lib/app-origin";
import { getDb } from "@/lib/db";
import { buildImportUrls } from "@/lib/import-identity";
import {
  buildOutreachEmail,
  type OutreachTemplateId,
} from "@/lib/outreach-templates";
import { getResend } from "@/lib/resend";

export class OutreachError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404 | 503 = 400,
  ) {
    super(message);
    this.name = "OutreachError";
  }
}

/**
 * Re-exported from `@/lib/app-origin` (see that module for why it lives on
 * its own) so existing importers of the app's origin from here keep working.
 */
export { appOrigin };

/**
 * Sends one outreach email to a lead's site and logs it to `OutreachMessage`
 * regardless of outcome. The claim link is supplied by the caller rather than
 * built here: issuing a claim invitation is a side effect (it revokes earlier
 * invitations and mints a token) that belongs to whoever owns that
 * invitation's lifecycle — `leadOutreachWorkflow` — not to the mailbox.
 *
 * Persists QUEUED before sending, then SENT or FAILED after, so a delivery
 * that crashes mid-flight still leaves an auditable row. Failures are
 * rethrown after being recorded so callers (the workflow) can react — e.g.
 * revoke an undelivered claim invitation — rather than silently swallowing
 * the error.
 */
export async function sendLeadEmail(input: {
  siteId: string;
  template: OutreachTemplateId;
  claimUrl: string;
  to?: string;
  actor: string;
}): Promise<{ id: string; status: OutreachStatus }> {
  const db = getDb();
  const site = await db.site.findUnique({
    where: { id: input.siteId },
    select: { slug: true, name: true, vertical: true, email: true },
  });
  if (!site) throw new OutreachError("Site not found.", 404);

  const to = input.to ?? site.email;
  if (!to) {
    throw new OutreachError(
      "No contact email on file for this site.",
      400,
    );
  }

  const previewUrl = `${appOrigin()}${buildImportUrls(site.slug).preview}`;
  const email = buildOutreachEmail(input.template, {
    siteName: site.name,
    vertical: site.vertical,
    previewUrl,
    claimUrl: input.claimUrl,
  });

  const message = await db.outreachMessage.create({
    data: {
      siteId: input.siteId,
      direction: "OUTBOUND",
      fromAddress: email.from,
      toAddress: to,
      subject: email.subject,
      textBody: email.text,
      htmlBody: email.html,
      template: input.template,
      status: "QUEUED",
    },
  });

  try {
    const { data, error } = await getResend().emails.send(
      {
        from: email.from,
        to,
        replyTo: email.replyTo,
        subject: email.subject,
        html: email.html,
        text: email.text,
      },
      { headers: { "Idempotency-Key": `outreach-${message.id}` } },
    );
    if (error) throw new Error(error.message);
    await db.outreachMessage.update({
      where: { id: message.id },
      data: {
        status: "SENT",
        providerMessageId: data?.id ?? null,
        sentAt: new Date(),
      },
    });
    return { id: message.id, status: "SENT" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    await db.outreachMessage
      .update({
        where: { id: message.id },
        data: { status: "FAILED", error: reason },
      })
      .catch((updateError) => {
        console.error("[outreach] failed to record send failure", {
          siteId: input.siteId,
          messageId: message.id,
          error:
            updateError instanceof Error ? updateError.message : "unknown",
        });
      });
    console.error("[outreach] send failed", {
      siteId: input.siteId,
      template: input.template,
      actor: input.actor,
      error: reason,
    });
    throw error;
  }
}

export function listOutreachMessages(
  siteId: string,
): Promise<OutreachMessage[]> {
  const db = getDb();
  return db.outreachMessage.findMany({
    where: { siteId },
    orderBy: { createdAt: "desc" },
  });
}
