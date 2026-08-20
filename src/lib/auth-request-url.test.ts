import { describe, expect, it } from "bun:test";
import {
  authMutationRedirectResponse,
  internalAuthMutationHeaders,
  resolveAuthRequestOrigin,
} from "@/lib/auth-request-url";

function request(headers: Record<string, string>, url = "http://0.0.0.0:3000") {
  return new Request(url, { headers });
}

describe("auth request origin", () => {
  it("uses the allow-listed forwarded factory hostname in production", () => {
    expect(
      resolveAuthRequestOrigin(
        request({
          host: "0.0.0.0:3000",
          "x-forwarded-host": "cornershop.dev",
          "x-forwarded-proto": "https",
        }),
        {
          NODE_ENV: "production",
          NEXT_PUBLIC_APP_URL: "https://cornershop.dev",
        },
      ),
    ).toBe("https://cornershop.dev");
  });

  it("preserves the allow-listed niche hostname", () => {
    expect(
      resolveAuthRequestOrigin(
        request({
          host: "0.0.0.0:3000",
          "x-forwarded-host": "restofront.com",
        }),
        {
          NODE_ENV: "production",
          NEXT_PUBLIC_APP_URL: "https://cornershop.dev",
        },
      ),
    ).toBe("https://restofront.com");
  });

  it("falls back instead of trusting an unknown forwarded hostname", () => {
    expect(
      resolveAuthRequestOrigin(
        request({
          host: "0.0.0.0:3000",
          "x-forwarded-host": "attacker.example",
        }),
        {
          NODE_ENV: "production",
          NEXT_PUBLIC_APP_URL: "https://cornershop.dev",
        },
      ),
    ).toBe("https://cornershop.dev");
  });

  it("keeps a local development port", () => {
    expect(
      resolveAuthRequestOrigin(
        request({
          host: "127.0.0.1:3000",
          "x-forwarded-host": "localhost:4444",
          "x-forwarded-proto": "http",
        }),
        {
          NODE_ENV: "development",
          NEXT_PUBLIC_APP_URL: "http://localhost:3000",
        },
      ),
    ).toBe("http://localhost:4444");
  });

  it("rebuilds internal mutation origins without forwarding external navigation metadata", () => {
    const headers = internalAuthMutationHeaders(
      request(
        {
          host: "127.0.0.1:3100",
          origin: "https://checkout.stripe.com",
          referer: "https://checkout.stripe.com/pay/test",
          cookie: "cornershopdev.checkout_return=return-token",
          "user-agent": "browser-test",
        },
        "http://127.0.0.1:3100/api/auth/checkout",
      ),
    );

    expect(headers.get("origin")).toBe("http://127.0.0.1:3100");
    expect(headers.get("cookie")).toBe(
      "cornershopdev.checkout_return=return-token",
    );
    expect(headers.get("user-agent")).toBe("browser-test");
    expect(headers.has("referer")).toBe(false);
  });

  it("preserves auth cookies on a server-owned redirect destination", () => {
    const authHeaders = new Headers();
    authHeaders.append("set-cookie", "session=fresh; HttpOnly; Path=/");
    authHeaders.append("set-cookie", "checkout=; Max-Age=0; Path=/");
    const response = authMutationRedirectResponse(
      new Response('{"ready":true}', {
        headers: authHeaders,
      }),
      new URL("http://127.0.0.1:3100/dashboard?checkout=success"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://127.0.0.1:3100/dashboard?checkout=success",
    );
    expect(response.headers.getSetCookie()).toEqual([
      "session=fresh; HttpOnly; Path=/",
      "checkout=; Max-Age=0; Path=/",
    ]);
  });
});
