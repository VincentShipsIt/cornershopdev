import "server-only";
import { pruneExpiredAnalytics } from "@/lib/analytics";

const DAY_MS = 24 * 60 * 60_000;
const MAX_INITIAL_JITTER_MS = 5 * 60_000;

type AnalyticsSchedulerGlobal = typeof globalThis & {
  __cornershopAnalyticsRetentionStarted?: boolean;
};

export function startAnalyticsRetentionScheduler(): void {
  const schedulerGlobal = globalThis as AnalyticsSchedulerGlobal;
  if (schedulerGlobal.__cornershopAnalyticsRetentionStarted) return;
  schedulerGlobal.__cornershopAnalyticsRetentionStarted = true;

  const run = () => {
    void pruneExpiredAnalytics().catch((error) => {
      console.error("[analytics-retention] prune failed", {
        error: error instanceof Error ? error.message : "unknown",
      });
    });
  };
  const initial = setTimeout(() => {
    run();
    const interval = setInterval(run, DAY_MS);
    interval.unref();
  }, Math.floor(Math.random() * MAX_INITIAL_JITTER_MS));
  initial.unref();
}
