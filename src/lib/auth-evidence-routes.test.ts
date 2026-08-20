import { describe, expect, it } from "bun:test";
import type { CurrentSession } from "@/lib/auth-sessions";

const { logoutResponseAfterAtomicRevocation, verifiedMagicLinkResponse } =
  await import("@/lib/auth-evidence-responses");

const currentSession: CurrentSession = {
  id: "session_1",
  token: "session_token_1",
  userId: "user_1",
  purpose: "SITE",
  organizationId: "organization_1",
  siteId: "site_1",
  siteSlug: "restaurant-one",
  expiresAt: new Date("2026-08-21T00:00:00.000Z"),
};

describe("required authentication evidence at route boundaries", () => {
  it("returns the verified session only after magic-link consumption is recorded", async () => {
    const consumed: string[] = [];
    const response = await verifiedMagicLinkResponse(
      "magic-token",
      verifiedResponse(),
      async (token) => {
        consumed.push(token);
      },
    );

    expect(consumed).toEqual(["magic-token"]);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://cornershop.dev/api/auth/complete",
    );
    expect(response.headers.get("set-cookie")).toContain("better-auth.session");
  });

  it("does not return Better Auth credentials when consumption evidence fails", async () => {
    const response = await verifiedMagicLinkResponse(
      "magic-token",
      verifiedResponse(),
      async () => {
        throw new Error("ledger unavailable");
      },
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).not.toContain(
      "better-auth.session=site-token",
    );
    expect(await response.json()).toEqual({
      error: "Sign-in could not be completed. Request a new link.",
    });
  });

  it("clears the session cookie only after atomic revocation commits", async () => {
    const recorded: CurrentSession[] = [];
    const response = await logoutResponseAfterAtomicRevocation(
      currentSession,
      async (session) => {
        recorded.push(session);
      },
    );

    expect(recorded).toEqual([currentSession]);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(
      "cornershopdev_session=",
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(await response.json()).toEqual({ success: true });
  });

  it("does not report success or clear the cookie when atomic revocation fails", async () => {
    const response = await logoutResponseAfterAtomicRevocation(
      currentSession,
      async () => {
        throw new Error("audit unavailable");
      },
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.json()).toEqual({
      error: "Sign-out could not be completed.",
    });
  });
});

function verifiedResponse() {
  return new Response(null, {
    status: 303,
    headers: {
      location: "https://cornershop.dev/api/auth/complete",
      "set-cookie": "better-auth.session=site-token; Path=/; HttpOnly",
    },
  });
}
