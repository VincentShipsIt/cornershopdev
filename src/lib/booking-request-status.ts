import { z } from "zod";

export const ownerBookingRequestStatusSchema = z.enum([
  "CONTACTED",
  "CLOSED",
]);

export type OwnerBookingRequestStatus = z.infer<
  typeof ownerBookingRequestStatusSchema
>;

export type BookingRequestStatusStore = {
  updateForSite: (input: {
    requestId: string;
    siteId: string;
    data: {
      status: OwnerBookingRequestStatus;
      contactedAt?: Date;
      closedAt?: Date | null;
    };
  }) => Promise<number>;
};

/**
 * The site id is part of the mutation predicate, not merely checked before it.
 * A valid tenant session holding another tenant's request id therefore receives
 * the same not-found result as a random id and changes no row.
 */
export async function updateBookingRequestStatus(
  store: BookingRequestStatusStore,
  input: {
    requestId: string;
    siteId: string;
    status: OwnerBookingRequestStatus;
    now?: Date;
  },
): Promise<boolean> {
  const now = input.now ?? new Date();
  const data =
    input.status === "CONTACTED"
      ? {
          status: input.status,
          contactedAt: now,
          // Reopening a closed request preserves its history in `contactedAt`
          // while making the current lifecycle state unambiguous.
          closedAt: null,
        }
      : { status: input.status, closedAt: now };

  return (
    (await store.updateForSite({
      requestId: input.requestId,
      siteId: input.siteId,
      data,
    })) === 1
  );
}
