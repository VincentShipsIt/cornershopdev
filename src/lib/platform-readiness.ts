import { createHash, timingSafeEqual } from "node:crypto";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { configuredBillingPlans } from "@/lib/billing-plans";
import { getDb } from "@/lib/db";
import { isDatabaseLoopbackHostname } from "@/lib/environment-isolation";
import { getRedisClient } from "@/lib/redis";
import { configuredOperatorAlertRecipients } from "@/lib/operator-alert-policy";

export type PlatformService =
  | "database"
  | "rateLimit"
  | "storage"
  | "billing"
  | "alerting";
export type PlatformServiceStatus =
  | "ready"
  | "misconfigured"
  | "unavailable";

type Environment = Record<string, string | undefined>;

export type ReadinessProbe = () => Promise<void>;

export type ReadinessProbes = Record<PlatformService, ReadinessProbe>;

export type ServiceReadiness = {
  service: PlatformService;
  status: PlatformServiceStatus;
  message: string;
};

export type PlatformReadiness = {
  status: "ready" | "not_ready";
  environment: "development" | "preview" | "production";
  services: ServiceReadiness[];
};

const probeTimeoutMs = 5_000;
const readinessCacheTtlMs = 5_000;

function deploymentEnvironment(
  env: Environment,
): PlatformReadiness["environment"] {
  if (env.VERCEL_ENV === "preview") return "preview";
  if (env.VERCEL_ENV === "production") return "production";
  if (env.NODE_ENV === "production") return "production";
  return "development";
}

function isDeployedEnvironment(
  environment: PlatformReadiness["environment"],
) {
  return environment === "preview" || environment === "production";
}

function validateDatabase(
  env: Environment,
  environment: PlatformReadiness["environment"],
): ServiceReadiness | null {
  const value = env.DATABASE_URL;
  if (!value) {
    return {
      service: "database",
      status: "misconfigured",
      message: "Set DATABASE_URL for this deployment environment.",
    };
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
      throw new Error("unsupported protocol");
    }
    if (
      isDeployedEnvironment(environment) &&
      isDatabaseLoopbackHostname(url.hostname)
    ) {
      return {
        service: "database",
        status: "misconfigured",
        message: "DATABASE_URL must use a managed host in deployed environments.",
      };
    }
  } catch {
    return {
      service: "database",
      status: "misconfigured",
      message: "DATABASE_URL must be a valid PostgreSQL connection URL.",
    };
  }

  return null;
}

function validateRateLimit(env: Environment): ServiceReadiness | null {
  const url = env.REDIS_URL;
  if (!url) {
    return {
      service: "rateLimit",
      status: "misconfigured",
      message: "Set REDIS_URL for this deployment environment.",
    };
  }

  try {
    const protocol = new URL(url).protocol;
    if (protocol !== "redis:" && protocol !== "rediss:") {
      throw new Error("unsupported protocol");
    }
  } catch {
    return {
      service: "rateLimit",
      status: "misconfigured",
      message: "REDIS_URL must be a valid Redis connection URL.",
    };
  }

  return null;
}

function validateStorage(env: Environment): ServiceReadiness | null {
  if (!env.S3_BUCKET || !env.S3_PUBLIC_BASE_URL || !env.AWS_REGION) {
    return {
      service: "storage",
      status: "misconfigured",
      message:
        "Set S3_BUCKET, S3_PUBLIC_BASE_URL, and AWS_REGION for this deployment environment.",
    };
  }
  try {
    if (new URL(env.S3_PUBLIC_BASE_URL).protocol !== "https:") {
      throw new Error("not HTTPS");
    }
  } catch {
    return {
      service: "storage",
      status: "misconfigured",
      message: "S3_PUBLIC_BASE_URL must be a valid HTTPS URL.",
    };
  }
  return null;
}

function validateBilling(env: Environment): ServiceReadiness | null {
  try {
    configuredBillingPlans(env);
  } catch {
    return {
      service: "billing",
      status: "misconfigured",
      message:
        "Set distinct STRIPE_STARTER_PRICE_ID and STRIPE_GROWTH_PRICE_ID values.",
    };
  }
  if (
    !env.STRIPE_SECRET_KEY ||
    !env.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_") ||
    !env.RESEND_API_KEY ||
    !env.CLAIM_TOKEN_SECRET ||
    env.CLAIM_TOKEN_SECRET.length < 32
  ) {
    return {
      service: "billing",
      status: "misconfigured",
      message:
        "Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY, and a 32-character CLAIM_TOKEN_SECRET.",
    };
  }
  return null;
}

function validateAlerting(env: Environment): ServiceReadiness | null {
  try {
    configuredOperatorAlertRecipients(env);
    return null;
  } catch {
    return {
      service: "alerting",
      status: "misconfigured",
      message:
        "Set OPERATOR_ALERT_EMAILS and RESEND_API_KEY for operator incident delivery.",
    };
  }
}

function configurationError(
  service: PlatformService,
  env: Environment,
  environment: PlatformReadiness["environment"],
) {
  if (service === "database") return validateDatabase(env, environment);
  if (service === "rateLimit") return validateRateLimit(env);
  if (service === "storage") return validateStorage(env);
  if (service === "billing") return validateBilling(env);
  return validateAlerting(env);
}

function createDefaultProbes(env: Environment): ReadinessProbes {
  return {
    database: async () => {
      await getDb().$queryRaw`SELECT 1`;
    },
    rateLimit: async () => {
      const redis = await getRedisClient();
      const response = await redis.ping();
      if (response !== "PONG") throw new Error("Redis ping failed");
    },
    storage: async () => {
      const s3 = new S3Client({ region: env.AWS_REGION });
      await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
    },
    // Price existence and recurring configuration are verified by Stripe when
    // Checkout creates a session. Readiness intentionally avoids calling the
    // Stripe API every five seconds.
    billing: async () => {},
    alerting: async () => {
      const blocked = await getDb().operatorAlert.count({
        where: {
          OR: [
            { status: "EXHAUSTED" },
            {
              status: "PENDING",
              attempts: { gt: 0 },
              nextAttemptAt: { lte: new Date() },
            },
          ],
        },
      });
      if (blocked > 0) {
        throw new Error("Operator alert delivery requires attention");
      }
    },
  };
}

async function withTimeout(probe: ReadinessProbe) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      probe(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Platform readiness probe timed out")),
          probeTimeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function checkPlatformReadiness(
  env: Environment = process.env,
  probes: ReadinessProbes = createDefaultProbes(env),
): Promise<PlatformReadiness> {
  const environment = deploymentEnvironment(env);
  const services = await Promise.all(
    ([
      "database",
      "rateLimit",
      "storage",
      "billing",
      "alerting",
    ] satisfies PlatformService[]).map(
      async (service): Promise<ServiceReadiness> => {
        const error = configurationError(service, env, environment);
        if (error) return error;

        try {
          await withTimeout(probes[service]);
          return {
            service,
            status: "ready",
            message: "Configured and reachable.",
          };
        } catch {
          return {
            service,
            status: "unavailable",
            message:
              service === "alerting"
                ? "Alert delivery is blocked. Run the dispatcher and inspect exhausted alerts."
                : "Configured but unreachable. Check provider status and credentials.",
          };
        }
      },
    ),
  );

  return {
    status: services.every((service) => service.status === "ready")
      ? "ready"
      : "not_ready",
    environment,
    services,
  };
}

export function isPlatformReadinessAuthorized(
  request: Request,
  expectedToken = process.env.HEALTHCHECK_TOKEN,
): boolean {
  if (!expectedToken) return false;

  const authorization = request.headers.get("authorization");
  const suppliedToken = authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!suppliedToken) return false;

  const suppliedHash = createHash("sha256").update(suppliedToken).digest();
  const expectedHash = createHash("sha256").update(expectedToken).digest();
  return timingSafeEqual(suppliedHash, expectedHash);
}

type ReadinessCacheOptions = {
  check?: () => Promise<PlatformReadiness>;
  now?: () => number;
  ttlMs?: number;
};

export function createCachedPlatformReadiness({
  check = checkPlatformReadiness,
  now = Date.now,
  ttlMs = readinessCacheTtlMs,
}: ReadinessCacheOptions = {}): () => Promise<PlatformReadiness> {
  let cached:
    | {
        expiresAt: number;
        readiness: PlatformReadiness;
      }
    | undefined;
  let inFlight: Promise<PlatformReadiness> | undefined;

  return async () => {
    if (cached && cached.expiresAt > now()) return cached.readiness;
    if (inFlight) return inFlight;

    inFlight = check()
      .then((readiness) => {
        cached = {
          expiresAt: now() + ttlMs,
          readiness,
        };
        return readiness;
      })
      .finally(() => {
        inFlight = undefined;
      });

    return inFlight;
  };
}
