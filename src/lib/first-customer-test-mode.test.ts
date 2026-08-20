import { describe, expect, it } from "bun:test";
import {
  assertFirstCustomerTestModeSafety,
  firstCustomerTestModeEnabled,
  secureCookieRequired,
} from "@/lib/first-customer-test-mode";

const safe = {
  CORNERSHOP_ENV: "test",
  FIRST_CUSTOMER_E2E: "1",
  NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100",
  STRIPE_API_BASE_URL: "http://127.0.0.1:4100",
  RESEND_API_BASE_URL: "http://127.0.0.1:4100",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/test",
  STRIPE_SECRET_KEY: "sk_test_first_customer",
  RESEND_API_KEY: "re_test_first_customer",
};

describe("first-customer provider test mode", () => {
  it("allows only the explicit all-loopback test boundary", () => {
    expect(firstCustomerTestModeEnabled(safe)).toBe(true);
    expect(() => assertFirstCustomerTestModeSafety(safe)).not.toThrow();
    expect(secureCookieRequired({ ...safe, NODE_ENV: "production" })).toBe(
      false,
    );
    expect(secureCookieRequired({ NODE_ENV: "production" })).toBe(true);
  });

  it("rejects partial, deployed, real-key, and remote-provider configurations", () => {
    for (const environment of [
      { ...safe, FIRST_CUSTOMER_E2E: undefined },
      { ...safe, VERCEL_ENV: "production" },
      { ...safe, STRIPE_SECRET_KEY: "sk_live_forbidden" },
      { ...safe, STRIPE_API_BASE_URL: "https://api.stripe.com" },
      { ...safe, DATABASE_URL: "postgresql://prod:prod@db.example.com/prod" },
    ]) {
      expect(() => assertFirstCustomerTestModeSafety(environment)).toThrow(
        "Unsafe first-customer test-mode configuration",
      );
    }
  });
});
