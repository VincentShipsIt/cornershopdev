import "server-only";
import {
  dispatchDueSourceMonitoring,
  SOURCE_MONITORING_SCHEDULER_INTERVAL_MS,
} from "@/lib/source-monitoring";

const MAX_INITIAL_JITTER_MS = 5 * 60_000;

type MonitoringSchedulerGlobal = typeof globalThis & {
  __cornershopSourceMonitoringStarted?: boolean;
};

export function startSourceMonitoringScheduler(): void {
  const schedulerGlobal = globalThis as MonitoringSchedulerGlobal;
  if (schedulerGlobal.__cornershopSourceMonitoringStarted) return;
  schedulerGlobal.__cornershopSourceMonitoringStarted = true;

  const run = () => {
    void dispatchDueSourceMonitoring()
      .then((result) => {
        console.log("[source-monitoring] dispatch complete", result);
      })
      .catch((error) => {
        console.error("[source-monitoring] dispatch failed", {
          error: error instanceof Error ? error.message : "unknown",
        });
      });
  };
  const initial = setTimeout(() => {
    run();
    const interval = setInterval(
      run,
      SOURCE_MONITORING_SCHEDULER_INTERVAL_MS,
    );
    interval.unref();
  }, Math.floor(Math.random() * MAX_INITIAL_JITTER_MS));
  initial.unref();
}
