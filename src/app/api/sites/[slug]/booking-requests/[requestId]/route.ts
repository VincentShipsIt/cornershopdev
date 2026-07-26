import {
  accessFailureResponse,
  getSiteAccess,
} from "@/lib/authorization";
import {
  ownerBookingRequestStatusSchema,
  updateBookingRequestStatus,
} from "@/lib/booking-request-status";
import { getDb } from "@/lib/db";

type BookingRequestRouteContext = {
  params: Promise<{ slug: string; requestId: string }>;
};

export async function PATCH(
  request: Request,
  { params }: BookingRequestRouteContext,
) {
  const { slug, requestId } = await params;
  const access = await getSiteAccess(slug);
  if (!access.ok) return accessFailureResponse(access);

  try {
    const body = (await request.json()) as { status?: unknown };
    const parsed = ownerBookingRequestStatusSchema.safeParse(body.status);
    if (!parsed.success) {
      return Response.json(
        { error: "Status must be CONTACTED or CLOSED" },
        { status: 400 },
      );
    }
    const status = parsed.data;
    const updated = await updateBookingRequestStatus(
      {
        updateForSite: async ({ requestId: id, siteId, data }) =>
          (
            await getDb().bookingRequest.updateMany({
              where: { id, siteId },
              data,
            })
          ).count,
      },
      {
        requestId,
        siteId: access.site.id,
        status,
      },
    );

    if (!updated) {
      return Response.json({ error: "Booking request not found" }, { status: 404 });
    }
    return Response.json({ ok: true, status });
  } catch (error) {
    console.error("[booking-request-status] update failed", {
      slug,
      requestId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return Response.json(
      { error: "Booking request could not be updated" },
      { status: 500 },
    );
  }
}
