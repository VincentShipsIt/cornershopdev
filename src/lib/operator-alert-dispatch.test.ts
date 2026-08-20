import { describe, expect, it } from "bun:test";
import {
  dispatchOperatorAlertBatch,
  OPERATOR_ALERT_DELIVERY_TIMEOUT_MS,
  OPERATOR_ALERT_DISPATCH_BATCH_SIZE,
  operatorAlertFailureState,
} from "@/lib/operator-alert-policy";

describe("operator alert batch dispatch", () => {
  it("continues after an individual alert raises an error", async () => {
    const attempted: string[] = [];

    const outcomes = await dispatchOperatorAlertBatch(
      ["alert_1", "alert_2"],
      async (id) => {
        attempted.push(id);
        if (id === "alert_1") throw new Error("transient claim failure");
        return "delivered";
      },
    );

    expect(attempted).toEqual(["alert_1", "alert_2"]);
    expect(outcomes.pending).toBe(1);
    expect(outcomes.delivered).toBe(1);
  });

  it("exhausts the third failure without an unreachable retry", () => {
    expect(
      operatorAlertFailureState(3, new Date("2026-08-20T10:00:00.000Z")),
    ).toEqual({ status: "EXHAUSTED" });
  });

  it("bounds a saturated dispatch batch inside the service budget", () => {
    const saturatedBatchDeliveryMs =
      OPERATOR_ALERT_DISPATCH_BATCH_SIZE *
      OPERATOR_ALERT_DELIVERY_TIMEOUT_MS;

    expect(OPERATOR_ALERT_DISPATCH_BATCH_SIZE).toBe(5);
    expect(saturatedBatchDeliveryMs).toBe(25_000);
    expect(saturatedBatchDeliveryMs).toBeLessThan(45_000);
  });
});
