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
};

function probes(): ReadinessProbes {
  return {
    database: mock(async () => {}),
    rateLimit: mock(async () => {}),
    storage: mock(async () => {}),
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
    ]);
    expect(serviceProbes.database).not.toHaveBeenCalled();
    expect(serviceProbes.rateLimit).not.toHaveBeenCalled();
    expect(serviceProbes.storage).not.toHaveBeenCalled();
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
  });

  it("fails deployed environments that point at a local database", async () => {
    const serviceProbes = probes();
    const result = await checkPlatformReadiness(
      {
        ...configuredEnvironment,
        DATABASE_URL: "postgresql://localhost:5432/cornershopdev",
      },
      serviceProbes,
    );

    expect(result.status).toBe("not_ready");
    expect(result.services[0]).toEqual({
      service: "database",
      status: "misconfigured",
      message: "DATABASE_URL must use a managed host in deployed environments.",
    });
    expect(serviceProbes.database).not.toHaveBeenCalled();
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
