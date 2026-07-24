import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import {
  claimableWhere,
  RestaurantNotClaimableError,
} from "@/lib/restaurant-claim";
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
  const restaurantSlug = checkout.metadata?.restaurantSlug;
  if (!email || !restaurantSlug) {
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

  if (process.env.DATABASE_URL) {
    const db = getDb();
    try {
      await db.$transaction(async (tx) => {
        const user = await tx.user.upsert({
          where: { email },
          update: {},
          create: { email },
        });
        const membership = await tx.membership.findFirst({
          where: { userId: user.id },
        });
        const organizationId =
          membership?.organizationId ??
          (
            await tx.organization.create({
              data: {
                name: restaurantSlug,
                memberships: {
                  create: { userId: user.id, role: "owner" },
                },
              },
            })
          ).id;

        // Matching on slug alone would let any completed checkout reassign
        // somebody else's restaurant, so eligibility is enforced inside the
        // WHERE clause where it is atomic and immune to a check-then-write
        // race. A zero count means the slug is missing or already owned by a
        // different organization; the transaction is rolled back and no
        // session cookie is issued for it.
        const claim = await tx.restaurant.updateMany({
          where: claimableWhere(restaurantSlug, organizationId),
          data: { organizationId, status: "CLAIMED" },
        });
        if (claim.count === 0) {
          throw new RestaurantNotClaimableError();
        }

        if (typeof checkout.customer === "string") {
          await tx.subscription.upsert({
            where: { stripeCustomerId: checkout.customer },
            update: {
              stripeSubscriptionId:
                typeof checkout.subscription === "string"
                  ? checkout.subscription
                  : null,
              stripePriceId,
              status: "ACTIVE",
            },
            create: {
              stripeCustomerId: checkout.customer,
              stripeSubscriptionId:
                typeof checkout.subscription === "string"
                  ? checkout.subscription
                  : null,
              stripePriceId,
              status: "ACTIVE",
              organizationId,
            },
          });
        }
      });
    } catch (error) {
      if (error instanceof RestaurantNotClaimableError) {
        return Response.json({ error: error.message }, { status: 409 });
      }
      throw error;
    }
  }

  const cookieStore = await cookies();
  cookieStore.set(
    SESSION_COOKIE,
    createSessionToken({ email, restaurantSlug }),
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
