import { z } from "zod";
import { normalizeAccountEmail } from "@/lib/account-email";
import { getDb } from "@/lib/db";
import { buildMagicLinkEmail } from "@/lib/magic-link-email";
import { getResend } from "@/lib/resend";
import { createSessionToken } from "@/lib/session";
import { isConfiguredSuperadminEmail } from "@/lib/superadmin-config";

const schema = z.object({
  email: z.string(),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const email = normalizeAccountEmail(input.email);
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
    const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!configuredAppUrl) {
      throw new Error("NEXT_PUBLIC_APP_URL is not configured");
    }
    const appUrl = new URL(configuredAppUrl).origin;
    const destination = isSuperadmin ? "admin" : "dashboard";
    const verifyUrl = `${appUrl}/api/auth/verify?token=${encodeURIComponent(token)}&destination=${destination}`;
    // Customer links use the niche identity they already trust. Operator links
    // use the factory consistently, including for admins who also own a site.
    const emailMessage = buildMagicLinkEmail({
      verifyUrl,
      isSuperadmin,
      site: site ?? null,
    });
    const { error } = await getResend().emails.send(
      {
        from: emailMessage.from,
        to: email,
        replyTo: emailMessage.replyTo,
        subject: emailMessage.subject,
        html: emailMessage.html,
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
