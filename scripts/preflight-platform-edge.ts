import { resolve4 } from "node:dns/promises";
import { getDb } from "@/lib/db";
import {
  evaluatePlatformDnsProbes,
  platformDnsProbeHostnames,
  platformTlsProbeHostnames,
} from "@/lib/platform-edge-readiness";

let phase: "dns" | "tls" | "invalid" = "invalid";

try {
  phase = parsePhase(process.argv.slice(2));
  const evidence =
    phase === "dns" ? await verifyWildcardDns() : await verifyOnDemandTls();
  console.log(JSON.stringify(evidence, null, 2));
  if (!evidence.ready) process.exitCode = 1;
} catch {
  console.error(
    JSON.stringify({
      command: "preflight-platform-edge",
      phase,
      ready: false,
      failure: "configuration_dns_database_or_tls_check_failed",
      failedAt: new Date().toISOString(),
    }),
  );
  process.exitCode = 1;
} finally {
  try {
    await getDb().$disconnect();
  } catch {
    // A missing or unreachable database is already represented by the safe
    // preflight failure above.
  }
}

async function verifyWildcardDns() {
  const hostnames = platformDnsProbeHostnames(
    process.env.DEPLOYED_GIT_SHA ?? "",
    process.env.PLATFORM_HOSTNAMES,
  );
  const answers = new Map<string, string[]>();
  await Promise.all(
    hostnames.map(async (hostname) => {
      answers.set(hostname, await resolve4(hostname).catch(() => []));
    }),
  );
  const result = evaluatePlatformDnsProbes(
    hostnames,
    process.env.PUBLIC_APP_IP ?? "",
    answers,
  );
  return {
    command: "preflight-platform-edge",
    phase: "dns" as const,
    ready: result.ready,
    checks: result.probes,
    customerAcceptanceProven: false,
    checkedAt: new Date().toISOString(),
  };
}

async function verifyOnDemandTls() {
  const site = await getDb().site.findFirst({
    orderBy: { createdAt: "asc" },
    select: { slug: true },
  });
  if (!site) throw new Error("No persisted site is available for TLS authorization");

  const hostnames = platformTlsProbeHostnames(
    site.slug,
    process.env.PLATFORM_HOSTNAMES,
  );
  const checks = await Promise.all(
    hostnames.map(async (hostname) => {
      try {
        const response = await fetch(`https://${hostname}/api/health/live`, {
          cache: "no-store",
          headers: { "User-Agent": "cornershopdev-release-preflight/1.0" },
          redirect: "manual",
          signal: AbortSignal.timeout(10_000),
        });
        const body = (await response.json().catch(() => null)) as {
          status?: string;
        } | null;
        return {
          hostname,
          httpsStatus: response.status,
          validApplicationResponse: body?.status === "live",
          ready: response.ok && body?.status === "live",
        };
      } catch {
        return {
          hostname,
          httpsStatus: null,
          validApplicationResponse: false,
          ready: false,
        };
      }
    }),
  );
  return {
    command: "preflight-platform-edge",
    phase: "tls" as const,
    ready: checks.every((check) => check.ready),
    checks,
    scope: "platform_edge_readiness_only",
    customerAcceptanceProven: false,
    checkedAt: new Date().toISOString(),
  };
}

function parsePhase(args: string[]): "dns" | "tls" {
  if (
    args.length !== 2 ||
    args[0] !== "--phase" ||
    (args[1] !== "dns" && args[1] !== "tls")
  ) {
    throw new Error("Use --phase dns or --phase tls.");
  }
  return args[1];
}
