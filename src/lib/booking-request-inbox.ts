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

export async function getBookingRequestInbox(
  siteId: string,
): Promise<BookingRequestDto[]> {
  const requests = await getDb().bookingRequest.findMany({
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
  });

  return requests.map((request) => ({
    ...request,
    requestedAt: request.requestedAt?.toISOString() ?? null,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  }));
}
