import { z } from "zod";
import { getDb } from "@/lib/db";
import { emailSender, getResend, platformReplyTo } from "@/lib/resend";
import { createSessionToken } from "@/lib/session";

const schema = z.object({ email: z.email() });

export async function POST(request: Request) {
  try {
    const { email } = schema.parse(await request.json());
    if (!process.env.DATABASE_URL) {
      throw new Error("Account database is not configured");
    }

    const user = await getDb().user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: {
            organization: {
              include: { sites: { take: 1 } },
            },
          },
          take: 1,
        },
      },
    });

    // Keep account existence private.
    if (!user) return Response.json({ ok: true });
    const site = user.memberships[0]?.organization.sites[0];
    if (!site) return Response.json({ ok: true });

    const token = createSessionToken({
      email,
      siteSlug: site.slug,
      expiresAt: Date.now() + 20 * 60 * 1000,
    });
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
    const verifyUrl = `${appUrl}/api/auth/verify?token=${encodeURIComponent(token)}`;
    const { error } = await getResend().emails.send(
      {
        from: emailSender(),
        to: email,
        replyTo: platformReplyTo(),
        subject: `Open ${site.name} in Restofront`,
        html: `<div style="font-family:Arial,sans-serif;background:#f4efe5;padding:40px">
          <div style="max-width:520px;margin:auto;background:white;border-radius:18px;padding:32px">
            <p style="font-size:13px;color:#a5482d;font-weight:700">RESTOFRONT</p>
            <h1 style="font-size:30px;line-height:1.05;margin:18px 0">Your site is ready.</h1>
            <p style="color:#5e5b55;line-height:1.6">Use the secure link below to open the ${site.name} dashboard. It expires in 20 minutes.</p>
            <p style="margin:28px 0"><a href="${verifyUrl}" style="background:#a5482d;color:white;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:700">Open dashboard</a></p>
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
          error instanceof Error ? error.message : "Sign-in link could not be sent",
      },
      { status: 400 },
    );
  }
}
