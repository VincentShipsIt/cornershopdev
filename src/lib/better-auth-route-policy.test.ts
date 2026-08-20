import { describe, expect, test } from "bun:test";
import { isBlockedDirectBetterAuthRoute } from "@/lib/better-auth-route-policy";

describe("Better Auth public route policy", () => {
  test("blocks the raw magic-link issuer", () => {
    expect(
      isBlockedDirectBetterAuthRoute(
        "POST",
        "/api/auth/sign-in/magic-link",
      ),
    ).toBe(true);
    expect(
      isBlockedDirectBetterAuthRoute(
        "post",
        "/api/auth/sign-in/magic-link/",
      ),
    ).toBe(true);
  });

  test("blocks GET verification so scanners cannot consume links", () => {
    expect(
      isBlockedDirectBetterAuthRoute(
        "GET",
        "/api/auth/magic-link/verify",
      ),
    ).toBe(true);
  });

  test("keeps checkout session bootstrapping behind its validated return route", () => {
    expect(
      isBlockedDirectBetterAuthRoute(
        "POST",
        "/api/auth/checkout/bootstrap",
      ),
    ).toBe(true);
  });

  test("keeps workspace rotation behind its same-origin wrapper", () => {
    expect(
      isBlockedDirectBetterAuthRoute(
        "POST",
        "/api/auth/workspace/select",
      ),
    ).toBe(true);
  });

  test("allows Better Auth session endpoints", () => {
    expect(
      isBlockedDirectBetterAuthRoute("GET", "/api/auth/get-session"),
    ).toBe(false);
    expect(
      isBlockedDirectBetterAuthRoute("POST", "/api/auth/sign-out"),
    ).toBe(false);
  });
});
