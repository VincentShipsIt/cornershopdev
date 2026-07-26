import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { normalizeAccountEmail } from "@/lib/account-email";
import {
  CHECKOUT_RETURN_COOKIE,
  verifyHashedToken,
} from "@/lib/claim-security";
import { getDb } from "@/lib/db";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";

const querySchema = z.object({
  sessionId: z.string().startsWith("cs_").max(256),
  claimInvitationId: z.string().min(1).max(128),
  poll: z.boolean(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    sessionId: url.searchParams.get("session_id"),
    claimInvitationId: url.searchParams.get("claim_id"),
    poll: url.searchParams.get("poll") === "1",
  });
  if (!parsed.success) {
    return Response.json({ error: "Invalid checkout return" }, { status: 400 });
  }
  if (!process.env.DATABASE_URL) {
    return Response.json(
      { error: "Accounts are temporarily unavailable" },
      { status: 503 },
    );
  }

  const { sessionId, claimInvitationId, poll } = parsed.data;
  const cookieStore = await cookies();
  const returnToken = cookieStore.get(CHECKOUT_RETURN_COOKIE)?.value;
  const invitation = await getDb().claimInvitation.findUnique({
    where: { id: claimInvitationId },
    select: {
      email: true,
      acceptedAt: true,
      checkoutSessionId: true,
      checkoutReturnTokenHash: true,
      checkoutReturnExpiresAt: true,
      site: {
        select: {
          id: true,
          slug: true,
          subscription: { select: { id: true } },
          organization: {
            select: {
              memberships: {
                select: {
                  userId: true,
                  user: { select: { email: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (
    !returnToken ||
    !invitation?.checkoutReturnTokenHash ||
    !invitation.checkoutReturnExpiresAt ||
    invitation.checkoutReturnExpiresAt <= new Date() ||
    invitation.checkoutSessionId !== sessionId ||
    !verifyHashedToken(returnToken, invitation.checkoutReturnTokenHash)
  ) {
    return Response.json({ error: "Invalid checkout return" }, { status: 403 });
  }

  const membership = invitation.site.organization?.memberships.find(
    (row) =>
      normalizeAccountEmail(row.user.email) ===
      normalizeAccountEmail(invitation.email),
  );
  const provisioned =
    invitation.acceptedAt &&
    invitation.site.subscription &&
    membership;

  if (!provisioned) {
    if (poll) {
      return Response.json(
        { ready: false },
        { status: 202, headers: { "Cache-Control": "no-store" } },
      );
    }
    redirect(
      `/claim/${encodeURIComponent(invitation.site.slug)}` +
        `?checkout=processing&session_id=${encodeURIComponent(sessionId)}` +
        `&claim_id=${encodeURIComponent(claimInvitationId)}`,
    );
  }

  await getDb().claimInvitation.updateMany({
    where: {
      id: claimInvitationId,
      checkoutSessionId: sessionId,
      checkoutReturnTokenHash: invitation.checkoutReturnTokenHash,
    },
    data: {
      checkoutReturnTokenHash: null,
      checkoutReturnExpiresAt: null,
    },
  });
  cookieStore.delete(CHECKOUT_RETURN_COOKIE);
  cookieStore.set(
    SESSION_COOKIE,
    createSessionToken({
      userId: membership.userId,
      siteSlug: invitation.site.slug,
    }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
    },
  );

  if (poll) {
    return Response.json(
      { ready: true, url: "/dashboard?checkout=success" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  redirect("/dashboard?checkout=success");
}
