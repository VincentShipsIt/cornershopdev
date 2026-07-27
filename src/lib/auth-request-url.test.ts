import { describe, expect, it } from "bun:test";
import { resolveAuthRequestOrigin } from "@/lib/auth-request-url";

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
});
