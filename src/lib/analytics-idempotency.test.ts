import { describe, expect, test } from "bun:test";
import { createIdempotentAnalyticsEvent } from "@/lib/analytics-idempotency";

describe("createIdempotentAnalyticsEvent", () => {
  test("reports a successful insert", async () => {
    expect(
      await createIdempotentAnalyticsEvent(async () => undefined),
    ).toBe("created");
  });

  test("treats Prisma unique conflicts as duplicate delivery", async () => {
    expect(
      await createIdempotentAnalyticsEvent(async () => {
        throw { code: "P2002" };
      }),
    ).toBe("duplicate");
  });

  test("does not hide other storage failures", async () => {
    expect(
      createIdempotentAnalyticsEvent(async () => {
        throw { code: "P2024" };
      }),
    ).rejects.toEqual({ code: "P2024" });
  });
});
