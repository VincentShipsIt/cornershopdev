import { describe, expect, mock, test } from "bun:test";
import {
  blockedDirectSessionRevocationPaths,
  dispatchBetterAuthCatchallRequest,
  isBlockedDirectBetterAuthRoute,
} from "@/lib/better-auth-route-policy";

const accountActions = await Bun.file(
  new URL("../components/account-actions.tsx", import.meta.url),
).text();
const logoutRoute = await Bun.file(
  new URL("../app/api/auth/logout/route.ts", import.meta.url),
).text();
const pinnedBetterAuthSessionRoutes = await Promise.all(
  ["session.mjs", "sign-out.mjs"].map((filename) =>
    Bun.file(
      new URL(
        `../../node_modules/better-auth/dist/api/routes/${filename}`,
        import.meta.url,
      ),
    ).text(),
  ),
).then((sources) => sources.join("\n"));

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

  test("keeps every pinned session-revocation route behind audited wrappers", async () => {
    const pinnedRevocationPaths = [
      ...pinnedBetterAuthSessionRoutes.matchAll(
        /createAuthEndpoint\("(\/(?:sign-out|revoke-[^"]+))"/g,
      ),
    ].map((match) => `/api/auth${match[1]}`);
    expect(pinnedRevocationPaths.sort()).toEqual(
      [...blockedDirectSessionRevocationPaths].sort(),
    );
    expect(blockedDirectSessionRevocationPaths).toEqual([
      "/api/auth/sign-out",
      "/api/auth/revoke-session",
      "/api/auth/revoke-sessions",
      "/api/auth/revoke-other-sessions",
    ]);
    for (const path of blockedDirectSessionRevocationPaths) {
      const betterAuthPath = path.replace("/api/auth", "");
      expect(pinnedBetterAuthSessionRoutes).toContain(
        `createAuthEndpoint("${betterAuthPath}"`,
      );
      expect(isBlockedDirectBetterAuthRoute("POST", path)).toBe(true);
      expect(isBlockedDirectBetterAuthRoute("post", `${path}/`)).toBe(true);

      const forward = mock(async () => Response.json({ bypassed: true }));
      const response = await dispatchBetterAuthCatchallRequest(
        new Request(`https://cornershop.dev${path}/`, { method: "POST" }),
        forward,
      );
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Not found" });
      expect(forward).not.toHaveBeenCalled();
    }
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

  test("forwards a direct request only when the route policy allows it", async () => {
    const forward = mock(async () => Response.json({ sessions: [] }));
    const response = await dispatchBetterAuthCatchallRequest(
      new Request("https://cornershop.dev/api/auth/list-sessions"),
      forward,
    );
    expect(response.status).toBe(200);
    expect(forward).toHaveBeenCalledTimes(1);
  });
});
