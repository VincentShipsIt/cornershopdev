import { describe, expect, it } from "bun:test";
import { isSameOriginMutation } from "@/lib/request-origin";

describe("mutation origin policy", () => {
  it("accepts the request origin and the configured public origin", () => {
    expect(
      isSameOriginMutation(
        request("https://internal.example/api/claim", {
          origin: "https://cornershop.dev",
        }),
        {
          environment: {
            NEXT_PUBLIC_APP_URL: "https://cornershop.dev/dashboard",
          },
        },
      ),
    ).toBe(true);
  });

  it("rejects explicit cross-site requests", () => {
    expect(
      isSameOriginMutation(
        request("https://cornershop.dev/api/claim", {
          origin: "https://attacker.test",
        }),
      ),
    ).toBe(false);
    expect(
      isSameOriginMutation(
        request("https://cornershop.dev/api/claim", {
          "sec-fetch-site": "cross-site",
        }),
      ),
    ).toBe(false);
  });

  it("requires an Origin header for cookie-authorized operator writes", () => {
    expect(
      isSameOriginMutation(request("https://cornershop.dev/api/admin"), {
        requireOrigin: true,
      }),
    ).toBe(false);
  });
});

function request(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { method: "POST", headers });
}
