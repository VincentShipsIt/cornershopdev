import { emailReplyTo, emailSender } from "@/lib/resend";
import { resolveVerticalConfig } from "@/lib/verticals/registry";
import type { VerticalId } from "@/lib/verticals/types";

export type ClaimInvitationEmail = {
  from: string;
  replyTo: string | undefined;
  subject: string;
  html: string;
};

export function buildClaimInvitationEmail(input: {
  claimUrl: string;
  siteName: string;
  vertical: VerticalId;
  expiresAt: Date;
  siteUrl: string;
}): ClaimInvitationEmail {
  const brand = resolveVerticalConfig(input.vertical).marketing.brand;
  const siteName = escapeHtml(input.siteName);
  const claimUrl = escapeHtml(input.claimUrl);
  const siteUrl = escapeHtml(input.siteUrl);
  const expiry = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(input.expiresAt);

  return {
    from: emailSender(input.vertical),
    replyTo: emailReplyTo(input.vertical),
    subject: `Verify ownership of ${input.siteName}`,
    html: `<div style="font-family:Arial,sans-serif;background:#f4efe5;padding:40px">
      <div style="max-width:520px;margin:auto;background:white;border-radius:18px;padding:32px">
        <p style="font-size:13px;color:#a5482d;font-weight:700">${brand.name.toUpperCase()}</p>
        <h1 style="font-size:30px;line-height:1.05;margin:18px 0">Verify ${siteName}.</h1>
        <p style="color:#5e5b55;line-height:1.6">This one-time link proves access to the approved owner email before subscription checkout can begin.</p>
        <p style="margin:28px 0"><a href="${claimUrl}" style="background:#a5482d;color:white;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:700">Continue secure claim</a></p>
        <p style="color:#5e5b55;line-height:1.6">After you claim and publish, the site is live at <a href="${siteUrl}">${siteUrl.replace(/^https:\/\//, "")}</a>.</p>
        <p style="font-size:12px;color:#858079">The link expires ${expiry} UTC. If you did not request it, ignore this email.</p>
      </div>
    </div>`,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
