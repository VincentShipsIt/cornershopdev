import { describe, expect, it, mock } from "bun:test";
import {
  checkPlatformReadiness,
  createCachedPlatformReadiness,
  isPlatformReadinessAuthorized,
  type PlatformReadiness,
  type ReadinessProbes,
} from "@/lib/platform-readiness";

const configuredEnvironment = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://preview.example.test/cornershopdev",
  REDIS_URL: "redis://redis.example.test:6379",
  S3_BUCKET: "assets.cornershop.dev",
  S3_PUBLIC_BASE_URL: "https://assets.cornershopdev.example.test",
  AWS_REGION: "us-west-1",
  STRIPE_SECRET_KEY: "sk_test_configured",
  STRIPE_WEBHOOK_SECRET: "whsec_configured",
  STRIPE_STARTER_PRICE_ID: "price_starter",
  STRIPE_GROWTH_PRICE_ID: "price_growth",
  RESEND_API_KEY: "re_test_configured",
  CLAIM_TOKEN_SECRET: "a-secure-test-secret-that-is-long-enough",
  OPERATOR_ALERT_EMAILS: "ops@example.com",
};

function probes(): ReadinessProbes {
  return {
    database: mock(async () => {}),
    rateLimit: mock(async () => {}),
    storage: mock(async () => {}),
    billing: mock(async () => {}),
    alerting: mock(async () => {}),
  };
}

describe("checkPlatformReadiness", () => {
  it("reports every missing service without running probes", async () => {
    const serviceProbes = probes();
    const result = await checkPlatformReadiness(
      { NODE_ENV: "production" },
      serviceProbes,
    );

    expect(result.status).toBe("not_ready");
    expect(result.environment).toBe("production");
    expect(result.services).toEqual([
      {
        service: "database",
        status: "misconfigured",
        message: "Set DATABASE_URL for this deployment environment.",
      },
      {
        service: "rateLimit",
        status: "misconfigured",
        message: "Set REDIS_URL for this deployment environment.",
      },
      {
        service: "storage",
        status: "misconfigured",
        message:
          "Set S3_BUCKET, S3_PUBLIC_BASE_URL, and AWS_REGION for this deployment environment.",
      },
      {
        service: "billing",
        status: "misconfigured",
        message:
          "Set distinct STRIPE_STARTER_PRICE_ID and STRIPE_GROWTH_PRICE_ID values.",
      },
      {
        service: "alerting",
        status: "misconfigured",
        message:
          "Set OPERATOR_ALERT_EMAILS and RESEND_API_KEY for operator incident delivery.",
      },
    ]);
    expect(serviceProbes.database).not.toHaveBeenCalled();
    expect(serviceProbes.rateLimit).not.toHaveBeenCalled();
    expect(serviceProbes.storage).not.toHaveBeenCalled();
    expect(serviceProbes.billing).not.toHaveBeenCalled();
    expect(serviceProbes.alerting).not.toHaveBeenCalled();
  });

  it("reports configured and reachable services as ready", async () => {
    const serviceProbes = probes();
    const result = await checkPlatformReadiness(
      configuredEnvironment,
      serviceProbes,
    );

    expect(result.status).toBe("ready");
    expect(result.services.every((service) => service.status === "ready")).toBe(
      true,
    );
    expect(serviceProbes.database).toHaveBeenCalledTimes(1);
    expect(serviceProbes.rateLimit).toHaveBeenCalledTimes(1);
    expect(serviceProbes.storage).toHaveBeenCalledTimes(1);
    expect(serviceProbes.alerting).toHaveBeenCalledTimes(1);
  });

  it("requires invitation email delivery for billing readiness", async () => {
    const serviceProbes = probes();
    const result = await checkPlatformReadiness(
      { ...configuredEnvironment, RESEND_API_KEY: undefined },
      serviceProbes,
    );

    expect(result.status).toBe("not_ready");
    expect(
      result.services.find((service) => service.service === "billing"),
    ).toEqual({
      service: "billing",
      status: "misconfigured",
      message:
        "Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY, and a 32-character CLAIM_TOKEN_SECRET.",
    });
    expect(serviceProbes.billing).not.toHaveBeenCalled();
    expect(serviceProbes.alerting).not.toHaveBeenCalled();
  });

  it("fails deployed environments that point at a local database", async () => {
    for (const databaseUrl of [
      "postgresql://localhost:5432/cornershopdev",
      "postgresql://127.0.0.1:5432/cornershopdev",
      "postgresql://127.0.0.2:5432/cornershopdev",
      "postgresql://[::1]:5432/cornershopdev",
    ]) {
      const serviceProbes = probes();
      const result = await checkPlatformReadiness(
        { ...configuredEnvironment, DATABASE_URL: databaseUrl },
        serviceProbes,
      );

      expect(result.status).toBe("not_ready");
      expect(result.services[0]).toEqual({
        service: "database",
        status: "misconfigured",
        message:
          "DATABASE_URL must use a managed host in deployed environments.",
      });
      expect(serviceProbes.database).not.toHaveBeenCalled();
    }
  });

  it("does not expose provider errors or credential values", async () => {
    const serviceProbes = probes();
    serviceProbes.rateLimit = mock(async () => {
      throw new Error(`request failed with ${configuredEnvironment.REDIS_URL}`);
    });

    const result = await checkPlatformReadiness(
      configuredEnvironment,
      serviceProbes,
    );
    const serialized = JSON.stringify(result);

    expect(result.status).toBe("not_ready");
    expect(result.services[1]).toEqual({
      service: "rateLimit",
      status: "unavailable",
      message:
        "Configured but unreachable. Check provider status and credentials.",
    });
    expect(serialized).not.toContain(configuredEnvironment.REDIS_URL);
    expect(serialized).not.toContain(configuredEnvironment.S3_BUCKET);
    expect(serialized).not.toContain(configuredEnvironment.DATABASE_URL);
  });

  it("reports unavailable storage without exposing provider errors", async () => {
    const serviceProbes = probes();
    serviceProbes.storage = mock(async () => {
      throw new Error(`S3 failed for ${configuredEnvironment.S3_BUCKET}`);
    });

    const result = await checkPlatformReadiness(
      configuredEnvironment,
      serviceProbes,
    );
    const storage = result.services.find(
      (service) => service.service === "storage",
    );

    expect(storage).toEqual({
      service: "storage",
      status: "unavailable",
      message:
        "Configured but unreachable. Check provider status and credentials.",
    });
    expect(JSON.stringify(result)).not.toContain(
      configuredEnvironment.S3_BUCKET,
    );
  });

  it("reports an actionable blocked alert queue without exposing recipients", async () => {
    const serviceProbes = probes();
    serviceProbes.alerting = mock(async () => {
      throw new Error(`delivery failed for ${configuredEnvironment.OPERATOR_ALERT_EMAILS}`);
    });

    const result = await checkPlatformReadiness(
      configuredEnvironment,
      serviceProbes,
    );
    const alerting = result.services.find(
      (service) => service.service === "alerting",
    );

    expect(alerting).toEqual({
      service: "alerting",
      status: "unavailable",
      message:
        "Alert delivery is blocked. Run the dispatcher and inspect exhausted alerts.",
    });
    expect(JSON.stringify(result)).not.toContain(
      configuredEnvironment.OPERATOR_ALERT_EMAILS,
    );
  });
});

describe("platform readiness endpoint protection", () => {
  it("fails closed without a configured token", () => {
    const request = new Request(
      "https://cornershopdev.example/api/health/ready",
      {
        headers: { Authorization: "Bearer supplied-token" },
      },
    );

    expect(isPlatformReadinessAuthorized(request, "")).toBe(false);
  });

  it("accepts only the configured bearer token", () => {
    const authorized = new Request(
      "https://cornershopdev.example/api/health/ready",
      {
        headers: { Authorization: "Bearer expected-token" },
      },
    );
    const unauthorized = new Request(
      "https://cornershopdev.example/api/health/ready",
      {
        headers: { Authorization: "Bearer different-token" },
      },
    );

    expect(isPlatformReadinessAuthorized(authorized, "expected-token")).toBe(
      true,
    );
    expect(isPlatformReadinessAuthorized(unauthorized, "expected-token")).toBe(
      false,
    );
  });

  it("deduplicates concurrent probes and caches their result briefly", async () => {
    let currentTime = 1_000;
    const readiness: PlatformReadiness = {
      status: "ready",
      environment: "preview",
      services: [],
    };
    const check = mock(async () => readiness);
    const getReadiness = createCachedPlatformReadiness({
      check,
      now: () => currentTime,
      ttlMs: 5_000,
    });

    const [first, second] = await Promise.all([getReadiness(), getReadiness()]);
    const cached = await getReadiness();

    expect(first).toBe(readiness);
    expect(second).toBe(readiness);
    expect(cached).toBe(readiness);
    expect(check).toHaveBeenCalledTimes(1);

    currentTime += 5_001;
    await getReadiness();
    expect(check).toHaveBeenCalledTimes(2);
  });
});
