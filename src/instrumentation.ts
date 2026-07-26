export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;

  if (process.env.DATABASE_URL) {
    const { startAnalyticsRetentionScheduler } = await import(
      "@/lib/analytics-retention-runtime"
    );
    startAnalyticsRetentionScheduler();
  }

  if (process.env.WORKFLOW_TARGET_WORLD === "@workflow/world-postgres") {
    const { getWorld } = await import("workflow/runtime");
    await getWorld().start?.();
  }
}
