import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { normalizeAccountEmail } from "@/lib/account-email";
import { verifyHashedToken } from "@/lib/claim-security";
import { getDb } from "@/lib/db";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";
import { getStripe } from "@/lib/stripe";

const querySchema = z.object({
  sessionId: z.string().startsWith("cs_").max(256),
  claimInvitationId: z.string().min(1).max(128),
  state: z.string().min(32).max(256),
  poll: z.boolean(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    sessionId: url.searchParams.get("session_id"),
    claimInvitationId: url.searchParams.get("claim_id"),
    state: url.searchParams.get("state"),
    poll: url.searchParams.get("poll") === "1",
  });
  if (!parsed.success) {
    return Response.json({ error: "Invalid checkout return" }, { status: 400 });
  }
  const { sessionId, claimInvitationId, state, poll } = parsed.data;
  if (!process.env.DATABASE_URL) {
    return Response.json(
      { error: "Accounts are temporarily unavailable" },
      { status: 503 },
    );
  }

  const returnAuthorization = await getDb().claimInvitation.findUnique({
    where: { id: claimInvitationId },
    select: {
      stripeCheckoutSessionId: true,
      checkoutReturnTokenHash: true,
      checkoutReturnExpiresAt: true,
    },
  });
  if (
    !returnAuthorization?.checkoutReturnTokenHash ||
    !returnAuthorization.checkoutReturnExpiresAt ||
    returnAuthorization.checkoutReturnExpiresAt <= new Date() ||
    returnAuthorization.stripeCheckoutSessionId !== sessionId ||
    !verifyHashedToken(state, returnAuthorization.checkoutReturnTokenHash)
  ) {
    return Response.json({ error: "Invalid checkout return" }, { status: 403 });
  }

  const stripe = getStripe();
  const checkout = await stripe.checkout.sessions.retrieve(sessionId);
  if (
    checkout.status !== "complete" ||
    checkout.mode !== "subscription" ||
    checkout.payment_status === "unpaid" ||
    checkout.client_reference_id !== claimInvitationId ||
    checkout.metadata?.claimInvitationId !== claimInvitationId
  ) {
    return Response.json({ error: "Checkout is not complete" }, { status: 400 });
  }

  const customerId =
    typeof checkout.customer === "string" ? checkout.customer : null;
  const checkoutEmail =
    checkout.customer_details?.email ?? checkout.customer_email;
  const invitation = await getDb().claimInvitation.findUnique({
    where: { id: claimInvitationId },
    select: {
      email: true,
      acceptedAt: true,
      stripeCheckoutSessionId: true,
      site: {
        select: {
          slug: true,
          organization: {
            select: {
              subscriptions: {
                where: customerId
                  ? { stripeCustomerId: customerId }
                  : { stripeCustomerId: "__missing__" },
                take: 1,
                select: { id: true },
              },
              memberships: {
                where: checkoutEmail
                  ? {
                      user: {
                        email: normalizeAccountEmail(checkoutEmail),
                      },
                    }
                  : { id: "__missing__" },
                take: 1,
                select: { userId: true },
              },
            },
          },
        },
      },
    },
  });
  const membership = invitation?.site.organization?.memberships[0];
  const provisioned =
    invitation?.acceptedAt &&
    invitation.stripeCheckoutSessionId === sessionId &&
    checkoutEmail &&
    normalizeAccountEmail(invitation.email) ===
      normalizeAccountEmail(checkoutEmail) &&
    invitation.site.organization?.subscriptions.length === 1 &&
    membership;

  if (!provisioned) {
    if (poll) {
      return Response.json(
        { ready: false },
        { status: 202, headers: { "Cache-Control": "no-store" } },
      );
    }
    redirect(
      `/claim/${encodeURIComponent(checkout.metadata?.siteSlug ?? "site")}` +
        `?checkout=processing&session_id=${encodeURIComponent(sessionId)}` +
        `&claim_id=${encodeURIComponent(claimInvitationId)}` +
        `&state=${encodeURIComponent(state)}`,
    );
  }

  const cookieStore = await cookies();
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
