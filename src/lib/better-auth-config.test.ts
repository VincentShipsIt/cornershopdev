import { describe, expect, it } from "bun:test";
import {
  betterAuthAllowedHosts,
  betterAuthTrustedOrigins,
  resolveBetterAuthSecret,
} from "@/lib/better-auth-config";

describe("Better Auth deployment configuration", () => {
  it("uses the dedicated secret before the claim-secret rollout fallback", () => {
    expect(
      resolveBetterAuthSecret({
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: "b".repeat(32),
        CLAIM_TOKEN_SECRET: "c".repeat(32),
      }),
    ).toBe("b".repeat(32));
    expect(
      resolveBetterAuthSecret({
        NODE_ENV: "production",
        CLAIM_TOKEN_SECRET: "c".repeat(32),
      }),
    ).toBe("c".repeat(32));
  });

  it("fails closed without a production-grade secret", () => {
    expect(() =>
      resolveBetterAuthSecret({
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: "short",
      }),
    ).toThrow("at least 32 characters");
  });

  it("allows the factory and launched niche hosts without wildcard trust", () => {
    const environment = {
      NODE_ENV: "production",
      NEXT_PUBLIC_APP_URL: "https://cornershop.dev",
    };
    expect(betterAuthAllowedHosts(environment)).toEqual(
      expect.arrayContaining([
        "cornershop.dev",
        "www.cornershop.dev",
        "restofront.com",
        "www.restofront.com",
      ]),
    );
    expect(betterAuthTrustedOrigins(environment)).toContain(
      "https://restofront.com",
    );
    expect(betterAuthTrustedOrigins(environment)).not.toContain(
      "http://localhost:3000",
    );
  });
});
