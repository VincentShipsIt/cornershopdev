import { describe, expect, test } from "bun:test";
import { isBlockedDirectBetterAuthRoute } from "@/lib/better-auth-route-policy";

const accountActions = await Bun.file(
  new URL("../components/account-actions.tsx", import.meta.url),
).text();
const logoutRoute = await Bun.file(
  new URL("../app/api/auth/logout/route.ts", import.meta.url),
).text();

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

  test("keeps sign-out behind the evidence-gated logout wrapper", () => {
    expect(
      isBlockedDirectBetterAuthRoute("POST", "/api/auth/sign-out"),
    ).toBe(true);
    expect(accountActions).toContain('fetch("/api/auth/logout"');
    expect(accountActions).not.toContain("/api/auth/sign-out");
    expect(logoutRoute).toContain("failOnSessionLookupError: true");
    expect(logoutRoute).toContain("requireOwnerMembership: false");
    expect(logoutRoute).toContain("revokeCurrentSessionAtomically");
    expect(logoutRoute).not.toContain("auth.handler");
  });

  test("allows read-only Better Auth session endpoints", () => {
    expect(
      isBlockedDirectBetterAuthRoute("GET", "/api/auth/get-session"),
    ).toBe(false);
  });
});
