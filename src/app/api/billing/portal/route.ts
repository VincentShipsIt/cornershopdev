import { z } from "zod";
import {
  accessFailureResponse,
  getSiteAccess,
} from "@/lib/authorization";
import { getDb } from "@/lib/db";
import { getStripe } from "@/lib/stripe";

const requestSchema = z.object({
  siteSlug: z.string().trim().min(2).max(80),
});

export async function POST(request: Request) {
  try {
    const { siteSlug } = requestSchema.parse(await request.json());
    const access = await getSiteAccess(siteSlug);
    if (!access.ok) return accessFailureResponse(access);

    const owner = await getDb().membership.findFirst({
      where: {
        organizationId: access.site.organizationId,
        userId: access.user.id,
        role: "owner",
      },
      select: { id: true },
    });
    if (!owner) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const subscription = await getDb().subscription.findFirst({
      where: { organizationId: access.site.organizationId },
      orderBy: { updatedAt: "desc" },
      select: { stripeCustomerId: true },
    });
    if (!subscription) {
      return Response.json(
        { error: "No billing account is available" },
        { status: 404 },
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) throw new Error("Application URL is not configured");
    const portal = await getStripe().billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${new URL(appUrl).origin}/dashboard`,
    });
    return Response.json({ url: portal.url });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Invalid billing request" }, { status: 400 });
    }
    console.error("[billing-portal] session creation failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return Response.json(
      { error: "Billing management is temporarily unavailable" },
      { status: 500 },
    );
  }
}
