import { FACTORY_BRAND } from "@/lib/brand";
import { emailReplyTo, emailSender } from "@/lib/email-identity";
import { resolveVerticalConfig } from "@/lib/verticals/registry";
import type { VerticalId } from "@/lib/verticals/types";

type MagicLinkSite = {
  name: string;
  vertical: VerticalId;
};

export type MagicLinkEmail = {
  from: string;
  replyTo: string | undefined;
  subject: string;
  html: string;
};

/**
 * Builds one coherent identity for the whole message. Platform operators use
 * the factory sender even when they also own a customer site; customers use the
 * niche that sold their site.
 */
export function buildMagicLinkEmail(input: {
  verifyUrl: string;
  isSuperadmin: boolean;
  site: MagicLinkSite | null;
  workspaceCount?: number;
}): MagicLinkEmail {
  if (!input.isSuperadmin && !input.site) {
    throw new Error("A customer site is required for a customer sign-in link");
  }

  const brand = input.isSuperadmin
    ? FACTORY_BRAND
    : resolveVerticalConfig(input.site!.vertical).marketing.brand;
  const vertical = input.isSuperadmin ? null : input.site!.vertical;
  const multipleWorkspaces = (input.workspaceCount ?? 0) > 1;
  const accountName = input.isSuperadmin
    ? "operator console"
    : multipleWorkspaces
      ? "workspace chooser"
      : `${input.site!.name} dashboard`;
  const escapedAccountName = escapeHtml(accountName);
  const actionLabel = input.isSuperadmin
    ? "Open console"
    : multipleWorkspaces
      ? "Choose workspace"
      : "Open dashboard";
  const subject = input.isSuperadmin
    ? `Open the ${FACTORY_BRAND.name} operator console`
    : `Open ${input.site!.name} in ${brand.name}`;

  return {
    from: emailSender(vertical),
    replyTo: emailReplyTo(vertical),
    subject,
    html: `<div style="font-family:Arial,sans-serif;background:#f4efe5;padding:40px">
      <div style="max-width:520px;margin:auto;background:white;border-radius:18px;padding:32px">
        <p style="font-size:13px;color:#a5482d;font-weight:700">${brand.name.toUpperCase()}</p>
        <h1 style="font-size:30px;line-height:1.05;margin:18px 0">Your site is ready.</h1>
        <p style="color:#5e5b55;line-height:1.6">Use the secure link below to open the ${escapedAccountName}. It expires in 20 minutes.</p>
        <p style="margin:28px 0"><a href="${input.verifyUrl}" style="background:#a5482d;color:white;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:700">${actionLabel}</a></p>
        <p style="font-size:12px;color:#858079">If you did not request this link, you can ignore this email.</p>
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
