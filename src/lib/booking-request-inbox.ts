import "server-only";
import type { BookingRequestStatus } from "@/generated/prisma/enums";
import { getDb } from "@/lib/db";

export type BookingRequestDto = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  requestedAt: string | null;
  partySize: number | null;
  notes: string | null;
  status: BookingRequestStatus;
  createdAt: string;
  updatedAt: string;
};

export type BookingRequestInboxDto = {
  requests: BookingRequestDto[];
  total: number;
  awaitingContact: number;
  truncated: boolean;
};

export async function getBookingRequestInbox(
  siteId: string,
): Promise<BookingRequestInboxDto> {
  const db = getDb();
  const [requests, total, awaitingContact] = await Promise.all([
    db.bookingRequest.findMany({
      where: { siteId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        requestedAt: true,
        partySize: true,
        notes: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    db.bookingRequest.count({ where: { siteId } }),
    db.bookingRequest.count({
      where: {
        siteId,
        status: { in: ["NEW", "NOTIFIED"] },
      },
    }),
  ]);

  return {
    requests: requests.map((request) => ({
      ...request,
      requestedAt: request.requestedAt?.toISOString() ?? null,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
    })),
    total,
    awaitingContact,
    truncated: total > requests.length,
  };
}
