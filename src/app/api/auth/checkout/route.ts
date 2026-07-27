import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { normalizeAccountEmail } from "@/lib/account-email";
import { authRequestUrl } from "@/lib/auth-request-url";
import { auth } from "@/lib/better-auth";
import {
  CHECKOUT_RETURN_COOKIE,
  verifyHashedToken,
} from "@/lib/claim-security";
import { getDb } from "@/lib/db";

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

  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  return auth.handler(
    new Request(authRequestUrl("/api/auth/checkout/bootstrap", request), {
      method: "POST",
      headers,
      body: JSON.stringify({
        sessionId,
        claimInvitationId,
        poll,
      }),
      redirect: "manual",
    }),
  );
}
