import { NextResponse } from "next/server";
import { z } from "zod";
import {
  bookingRequestInputSchema,
  createBookingRequest,
  notifyOwnerOfBookingRequest,
} from "@/lib/booking-requests";
import { getDb } from "@/lib/db";
import { limitBookingRequest } from "@/lib/rate-limit";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string }> };

/**
 * The one unauthenticated write a generated site exposes to its visitors.
 *
 * Metered before anything else runs, validated against a closed schema, and
 * answered with either the visitor's own validation problem or a fixed generic
 * message — the same redaction posture as the import route, for the same reason:
 * this is a public endpoint and internal failure text is not the caller's
 * business.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const { slug } = await params;

  const rateLimit = await limitBookingRequest(request);
  if (!rateLimit.success) {
    const unavailable = rateLimit.reason === "unavailable";
    return NextResponse.json(
      {
        error: unavailable
          ? "Booking requests are temporarily unavailable"
          : "Too many requests from this connection. Try again later.",
      },
      {
        status: unavailable ? 503 : 429,
        headers: {
          "X-RateLimit-Remaining": String(rateLimit.remaining),
          "X-RateLimit-Reset": String(rateLimit.reset),
        },
      },
    );
  }

  try {
    const input = bookingRequestInputSchema.parse(await request.json());

    if (!process.env.DATABASE_URL) {
      return NextResponse.json(
        { error: "Booking requests are temporarily unavailable" },
        { status: 503 },
      );
    }

    const site = await getDb().site.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        organizationId: true,
        // Decides which niche the owner's notification is sent as.
        vertical: true,
      },
    });
    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    const created = await createBookingRequest(site, input);
    // Awaited rather than fired and forgotten: a floating promise does not
    // survive the response on serverless. It cannot fail the request — the lead
    // is already committed and the visitor is owed a success either way.
    const notified = await notifyOwnerOfBookingRequest(site, created);

    return NextResponse.json({ ok: true, notified });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Check the form and try again" },
        { status: 400 },
      );
    }

    console.error("[booking-request] failed", {
      slug,
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "Your request could not be sent. Try again in a moment." },
      { status: 500 },
    );
  }
}
