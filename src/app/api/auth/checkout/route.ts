import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { recordClaimRejection } from "@/lib/claim-invitations";
import { getDb } from "@/lib/db";
import { claimSite, SiteNotClaimableError } from "@/lib/site-claim";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";
import { getStripe } from "@/lib/stripe";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");
  if (!sessionId) return Response.json({ error: "Missing session" }, { status: 400 });

  const stripe = getStripe();
  const checkout = await stripe.checkout.sessions.retrieve(sessionId);
  if (checkout.status !== "complete") {
    return Response.json({ error: "Checkout is not complete" }, { status: 400 });
  }

  const email = checkout.customer_details?.email ?? checkout.customer_email;
  const siteSlug = checkout.metadata?.siteSlug;
  const claimInvitationId = checkout.metadata?.claimInvitationId;
  if (!email || !siteSlug || !claimInvitationId) {
    if (siteSlug) {
      await recordClaimRejection({
        siteSlug,
        reason: "checkout_metadata_missing",
        actor: "system:stripe-callback",
        invitationId: claimInvitationId,
      });
    }
    return Response.json(
      { error: "Checkout is missing account details" },
      { status: 400 },
    );
  }

  let stripePriceId = checkout.metadata?.priceId ?? null;
  if (!stripePriceId) {
    const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, {
      limit: 1,
    });
    const price = lineItems.data[0]?.price;
    stripePriceId = typeof price === "string" ? price : (price?.id ?? null);
  }

  // The session cookie issued below is the whole authorization model, so this
  // route must fail closed: without a database there is no way to verify that
  // the caller may claim this slug, and minting the cookie anyway would hand
  // out ownership of an arbitrary site.
  if (!process.env.DATABASE_URL) {
    return Response.json(
      { error: "Accounts are temporarily unavailable" },
      { status: 503 },
    );
  }

  let claimedAccess: Awaited<ReturnType<typeof claimSite>>;
  try {
    claimedAccess = await getDb().$transaction((tx) =>
      claimSite(tx, {
        email,
        siteSlug,
        claimInvitationId,
        stripeCheckoutSessionId: checkout.id,
        stripeCustomerId:
          typeof checkout.customer === "string" ? checkout.customer : null,
        stripeSubscriptionId:
          typeof checkout.subscription === "string"
            ? checkout.subscription
            : null,
        stripePriceId,
      }),
    );
  } catch (error) {
    if (error instanceof SiteNotClaimableError) {
      await recordClaimRejection({
        siteSlug,
        reason: "checkout_completion_rejected",
        actor: "system:stripe-callback",
        invitationId: claimInvitationId,
      });
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }

  const cookieStore = await cookies();
  cookieStore.set(
    SESSION_COOKIE,
    createSessionToken({ userId: claimedAccess.userId, siteSlug }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
    },
  );

  redirect("/dashboard?checkout=success");
}
