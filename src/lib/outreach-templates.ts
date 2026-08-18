import { emailReplyTo, emailSender } from "@/lib/resend";
import { resolveVerticalConfig } from "@/lib/verticals/registry";
import type { VerticalId } from "@/lib/verticals/types";

/** The closed set of outreach templates a lead can be sent. */
export type OutreachTemplateId = "preview_ready" | "follow_up_1";

export type OutreachEmail = {
  from: string;
  replyTo: string | undefined;
  subject: string;
  text: string;
  html: string;
};

export type OutreachTemplateInput = {
  siteName: string;
  vertical: VerticalId;
  previewUrl: string;
  claimUrl: string;
};

export function buildPreviewReadyEmail(
  input: OutreachTemplateInput,
): OutreachEmail {
  const brand = resolveVerticalConfig(input.vertical).marketing.brand;
  const siteName = escapeHtml(input.siteName);
  const previewUrl = escapeHtml(input.previewUrl);
  const claimUrl = escapeHtml(input.claimUrl);

  return {
    from: emailSender(input.vertical),
    replyTo: emailReplyTo(input.vertical),
    subject: `${input.siteName}, your new site is ready to preview`,
    text: [
      `Hi there,`,
      ``,
      `We built a live preview of a new site for ${input.siteName}: ${input.previewUrl}`,
      ``,
      `If you'd like to claim it and make it official, you can do that here: ${input.claimUrl}`,
      ``,
      `No obligation — this is just a preview. Reply to this email with any questions.`,
      ``,
      `— ${brand.name}`,
    ].join("\n"),
    html: `<div style="font-family:Arial,sans-serif;background:#f4efe5;padding:40px">
      <div style="max-width:520px;margin:auto;background:white;border-radius:18px;padding:32px">
        <p style="font-size:13px;color:#a5482d;font-weight:700">${brand.name.toUpperCase()}</p>
        <h1 style="font-size:28px;line-height:1.15;margin:18px 0">${siteName}, your new site is ready to preview.</h1>
        <p style="color:#5e5b55;line-height:1.6">We built a live preview based on your public listing. Take a look — it's yours to claim if you like it.</p>
        <p style="margin:28px 0"><a href="${previewUrl}" style="background:#a5482d;color:white;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:700">View your preview</a></p>
        <p style="color:#5e5b55;line-height:1.6">Ready to make it official?</p>
        <p style="margin:12px 0"><a href="${claimUrl}" style="color:#a5482d;font-weight:700">Claim this site</a></p>
        <p style="font-size:12px;color:#858079">No obligation — this is just a preview. Reply to this email with any questions.</p>
      </div>
    </div>`,
  };
}

export function buildFollowUp1Email(
  input: OutreachTemplateInput,
): OutreachEmail {
  const brand = resolveVerticalConfig(input.vertical).marketing.brand;
  const siteName = escapeHtml(input.siteName);
  const previewUrl = escapeHtml(input.previewUrl);
  const claimUrl = escapeHtml(input.claimUrl);

  return {
    from: emailSender(input.vertical),
    replyTo: emailReplyTo(input.vertical),
    subject: `Still there? Your ${input.siteName} preview is waiting`,
    text: [
      `Hi again,`,
      ``,
      `Just following up — the preview site we built for ${input.siteName} is still live: ${input.previewUrl}`,
      ``,
      `If you'd like to claim it, here's the link: ${input.claimUrl}`,
      ``,
      `If it's not a fit, no action needed and we won't keep following up.`,
      ``,
      `— ${brand.name}`,
    ].join("\n"),
    html: `<div style="font-family:Arial,sans-serif;background:#f4efe5;padding:40px">
      <div style="max-width:520px;margin:auto;background:white;border-radius:18px;padding:32px">
        <p style="font-size:13px;color:#a5482d;font-weight:700">${brand.name.toUpperCase()}</p>
        <h1 style="font-size:28px;line-height:1.15;margin:18px 0">Still there? ${siteName}'s preview is waiting.</h1>
        <p style="color:#5e5b55;line-height:1.6">Just following up in case you missed it — your preview is still live.</p>
        <p style="margin:28px 0"><a href="${previewUrl}" style="background:#a5482d;color:white;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:700">View your preview</a></p>
        <p style="margin:12px 0"><a href="${claimUrl}" style="color:#a5482d;font-weight:700">Claim this site</a></p>
        <p style="font-size:12px;color:#858079">If it's not a fit, no action needed and we won't keep following up.</p>
      </div>
    </div>`,
  };
}

export function buildOutreachEmail(
  template: OutreachTemplateId,
  input: OutreachTemplateInput,
): OutreachEmail {
  switch (template) {
    case "preview_ready":
      return buildPreviewReadyEmail(input);
    case "follow_up_1":
      return buildFollowUp1Email(input);
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
