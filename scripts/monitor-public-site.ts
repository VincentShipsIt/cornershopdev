import { captureOperatorAlert } from "@/lib/operator-alerts";
import { getDb } from "@/lib/db";

const execute = process.argv.slice(2).includes("--execute");
if (!execute) {
  throw new Error(
    "Refusing to exercise alert delivery without --execute. No alert was created.",
  );
}
const configuredUrl = process.env.PUBLIC_HEALTH_URL ?? process.env.NEXT_PUBLIC_APP_URL;
if (!configuredUrl) {
  throw new Error("Set PUBLIC_HEALTH_URL or NEXT_PUBLIC_APP_URL.");
}
const target = new URL("/api/health/live", configuredUrl);
if (target.protocol !== "https:" && process.env.NODE_ENV === "production") {
  throw new Error("Production public health monitoring requires HTTPS.");
}

let timeout: ReturnType<typeof setTimeout> | undefined;
try {
  const response = await Promise.race([
    fetch(target, {
      headers: { "User-Agent": "cornershopdev-health-monitor/1.0" },
      cache: "no-store",
    }),
    new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => reject(new Error("timeout")), 10_000);
    }),
  ]);
  if (!response.ok) throw new Error(`status-${response.status}`);
  const body = (await response.json()) as { status?: string };
  if (body.status !== "live") throw new Error("invalid-response");
  console.log(
    JSON.stringify({
      command: "monitor-public-site",
      healthy: true,
      checkedOrigin: target.origin,
      checkedAt: new Date().toISOString(),
    }),
  );
} catch {
  const outcome = await captureOperatorAlert({
    kind: "PUBLIC_SITE_HEALTH_FAILURE",
    dedupKey: target.origin,
    title: "Public site health check failed",
    message:
      "The public live endpoint did not return a valid healthy response. Check DNS, TLS, Caddy, the application container, and recent deploys.",
    context: { origin: target.origin },
  });
  console.log(
    JSON.stringify({
      command: "monitor-public-site",
      healthy: false,
      alertOutcome: outcome,
      checkedOrigin: target.origin,
      checkedAt: new Date().toISOString(),
    }),
  );
  process.exitCode = 1;
} finally {
  if (timeout) clearTimeout(timeout);
  try {
    await getDb().$disconnect();
  } catch {
    // A missing database is already represented by the alert fallback outcome.
  }
}
