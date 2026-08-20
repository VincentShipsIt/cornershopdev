import { describe, expect, it } from "bun:test";
import {
  OPERATOR_ALERT_DELIVERY_TIMEOUT_MS,
  OPERATOR_ALERT_DISPATCH_BATCH_SIZE,
} from "@/lib/operator-alert-policy";

const deployScript = await Bun.file(
  new URL("../../deploy/aws/deploy.sh", import.meta.url),
).text();
const monitorScript = await Bun.file(
  new URL("../../scripts/monitor-public-site.ts", import.meta.url),
).text();

describe("operator alert service deployment", () => {
  it("keeps alert draining out of the public health service", () => {
    expect(deployScript).toContain(
      "run operator:monitor-public-site --execute",
    );
    expect(deployScript).toContain("run operator:dispatch-alerts");
    expect(monitorScript).not.toContain("dispatchDueOperatorAlerts");
    expect(deployScript).toContain(
      "systemctl enable --now cornershopdev-public-health.timer",
    );
    expect(deployScript).toContain(
      "systemctl enable --now cornershopdev-operator-alerts.timer",
    );
  });

  it("keeps a saturated alert batch inside its service timeout", () => {
    const alertService = deployScript.match(
      /Description=Dispatch due Cornershopdev operator alerts[\s\S]*?TimeoutStartSec=(\d+)s[\s\S]*?operator:dispatch-alerts/,
    );
    expect(alertService).not.toBeNull();
    const serviceTimeoutMs = Number(alertService?.[1]) * 1_000;
    const saturatedBatchDeliveryMs =
      OPERATOR_ALERT_DISPATCH_BATCH_SIZE *
      OPERATOR_ALERT_DELIVERY_TIMEOUT_MS;

    expect(saturatedBatchDeliveryMs).toBe(25_000);
    expect(saturatedBatchDeliveryMs).toBeLessThan(serviceTimeoutMs);
  });
});
