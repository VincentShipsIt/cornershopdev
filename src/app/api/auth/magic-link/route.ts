import { z } from "zod";
import { FACTORY_BRAND } from "@/lib/brand";
import { getDb } from "@/lib/db";
import { emailReplyTo, emailSender, getResend } from "@/lib/resend";
import { createSessionToken } from "@/lib/session";
import { isConfiguredSuperadminEmail } from "@/lib/superadmin-config";
import { resolveVerticalConfig } from "@/lib/verticals/registry";

const schema = z.object({
  email: z.email().transform((email) => email.trim().toLowerCase()),
});

export async function POST(request: Request) {
  try {
    const { email } = schema.parse(await request.json());
    if (!process.env.DATABASE_URL) {
      throw new Error("Account database is not configured");
    }

    const user = await getDb().user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        platformRole: true,
        memberships: {
          select: {
            organization: {
              select: {
                sites: {
                  orderBy: { createdAt: "asc" },
                  take: 1,
                  select: {
                    slug: true,
                    name: true,
                    vertical: true,
                  },
                },
              },
            },
          },
          take: 1,
        },
      },
    });

    // Keep account existence private.
    if (!user) return Response.json({ ok: true });
    const site = user.memberships[0]?.organization.sites[0];
    const isSuperadmin =
      user.platformRole === "SUPERADMIN" &&
      isConfiguredSuperadminEmail(user.email);
    if (!site && !isSuperadmin) return Response.json({ ok: true });

    const token = createSessionToken({
      userId: user.id,
      siteSlug: site?.slug,
      expiresAt: Date.now() + 20 * 60 * 1000,
    });
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
    const destination = isSuperadmin ? "admin" : "dashboard";
    const verifyUrl = `${appUrl}/api/auth/verify?token=${encodeURIComponent(token)}&destination=${destination}`;
    // The niche that sold this site owns the whole message — sender, reply
    // address and the name in the copy. The factory's name appearing here would
    // introduce a brand the recipient has never bought from, in the one email
    // they must trust enough to click.
    const brand = isSuperadmin
      ? FACTORY_BRAND
      : resolveVerticalConfig(site!.vertical).marketing.brand;
    const accountName = isSuperadmin ? "operator console" : `${site!.name} dashboard`;
    const { error } = await getResend().emails.send(
      {
        from: emailSender(site.vertical),
        to: email,
        replyTo: emailReplyTo(site.vertical),
        subject: `Open ${site.name} in ${brand.name}`,
        html: `<div style="font-family:Arial,sans-serif;background:#f4efe5;padding:40px">
          <div style="max-width:520px;margin:auto;background:white;border-radius:18px;padding:32px">
            <p style="font-size:13px;color:#a5482d;font-weight:700">${brand.name.toUpperCase()}</p>
            <h1 style="font-size:30px;line-height:1.05;margin:18px 0">Your site is ready.</h1>
            <p style="color:#5e5b55;line-height:1.6">Use the secure link below to open the ${accountName}. It expires in 20 minutes.</p>
            <p style="margin:28px 0"><a href="${verifyUrl}" style="background:#a5482d;color:white;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:700">Open ${isSuperadmin ? "console" : "dashboard"}</a></p>
            <p style="font-size:12px;color:#858079">If you did not request this link, you can ignore this email.</p>
          </div>
        </div>`,
      },
      {
        headers: {
          "Idempotency-Key": `magic-link-${user.id}-${Math.floor(Date.now() / 300_000)}`,
        },
      },
    );
    if (error) throw new Error(error.message);

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Sign-in link could not be sent",
      },
      { status: 400 },
    );
  }
}
