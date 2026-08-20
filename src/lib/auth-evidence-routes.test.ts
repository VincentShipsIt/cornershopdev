import { describe, expect, it } from "bun:test";
import type { CurrentSession } from "@/lib/auth-sessions";

const { logoutResponseWithEvidence, verifiedMagicLinkResponse } = await import(
  "@/lib/auth-evidence-responses"
);

const currentSession: CurrentSession = {
  id: "session_1",
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

  it("returns sign-out success only after revocation evidence is recorded", async () => {
    const recorded: CurrentSession[] = [];
    const response = await logoutResponseWithEvidence(
      signedOutResponse(),
      currentSession,
      async (session) => {
        recorded.push(session);
      },
    );

    expect(recorded).toEqual([currentSession]);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(
      "better-auth.session=",
    );
  });

  it("does not report successful sign-out or forward cookies when revocation evidence fails", async () => {
    const response = await logoutResponseWithEvidence(
      signedOutResponse(),
      currentSession,
      async () => {
        throw new Error("audit unavailable");
      },
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.json()).toEqual({
      error: "Sign-out evidence could not be recorded.",
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

function signedOutResponse() {
  return Response.json(
    { success: true },
    {
      headers: {
        "set-cookie": "better-auth.session=; Path=/; Max-Age=0; HttpOnly",
      },
    },
  );
}
