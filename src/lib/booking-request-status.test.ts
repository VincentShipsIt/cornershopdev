import { describe, expect, it } from "bun:test";
import {
  updateBookingRequestStatus,
  type BookingRequestStatusStore,
} from "@/lib/booking-request-status";

describe("booking request status updates", () => {
  it("updates only a request owned by the accessed site", async () => {
    const rows = new Map([
      ["lead_a", { siteId: "site_a", status: "NEW" }],
      ["lead_b", { siteId: "site_b", status: "NEW" }],
    ]);
    const store = memoryStore(rows);

    expect(
      await updateBookingRequestStatus(store, {
        requestId: "lead_b",
        siteId: "site_a",
        status: "CLOSED",
      }),
    ).toBe(false);
    expect(rows.get("lead_b")?.status).toBe("NEW");
  });

  it("sets lifecycle timestamps and clears closedAt when reopened", async () => {
    const rows = new Map([
      [
        "lead_a",
        {
          siteId: "site_a",
          status: "CLOSED",
          closedAt: new Date("2026-07-01T00:00:00.000Z"),
        },
      ],
    ]);
    const store = memoryStore(rows);
    const now = new Date("2026-07-26T12:00:00.000Z");

    expect(
      await updateBookingRequestStatus(store, {
        requestId: "lead_a",
        siteId: "site_a",
        status: "CONTACTED",
        now,
      }),
    ).toBe(true);
    expect(rows.get("lead_a")).toMatchObject({
      status: "CONTACTED",
      contactedAt: now,
      closedAt: null,
    });
  });
});

function memoryStore(
  rows: Map<
    string,
    {
      siteId: string;
      status: string;
      contactedAt?: Date;
      closedAt?: Date | null;
    }
  >,
): BookingRequestStatusStore {
  return {
    updateForSite: async ({ requestId, siteId, data }) => {
      const row = rows.get(requestId);
      if (!row || row.siteId !== siteId) return 0;
      rows.set(requestId, { ...row, ...data });
      return 1;
    },
  };
}
