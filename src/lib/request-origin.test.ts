import { describe, expect, it } from "bun:test";
import {
  isSameOriginMutation,
  isTrustedSameOriginFormPost,
} from "@/lib/request-origin";

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

describe("no-referrer same-origin form policy", () => {
  const browserNavigationHeaders = {
    origin: "null",
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "navigate",
    "sec-fetch-dest": "document",
    "sec-fetch-user": "?1",
  };

  it("accepts a user-activated same-origin confirmation navigation", () => {
    expect(
      isTrustedSameOriginFormPost(
        request(
          "https://cornershop.dev/api/auth/verify",
          browserNavigationHeaders,
        ),
      ),
    ).toBe(true);
  });

  it("rejects a null origin from a cross-site navigation", () => {
    expect(
      isTrustedSameOriginFormPost(
        request("https://cornershop.dev/api/auth/verify", {
          ...browserNavigationHeaders,
          "sec-fetch-site": "cross-site",
        }),
      ),
    ).toBe(false);
  });

  it("rejects null or missing origins without the complete browser proof", () => {
    expect(
      isTrustedSameOriginFormPost(
        request("https://cornershop.dev/api/auth/verify", {
          origin: "null",
          "sec-fetch-site": "same-origin",
        }),
      ),
    ).toBe(false);
    expect(
      isTrustedSameOriginFormPost(
        request("https://cornershop.dev/api/auth/verify", {
          ...browserNavigationHeaders,
          origin: "",
        }),
      ),
    ).toBe(false);
  });

  it("still rejects an explicit cross-origin request", () => {
    expect(
      isTrustedSameOriginFormPost(
        request("https://cornershop.dev/api/auth/verify", {
          ...browserNavigationHeaders,
          origin: "https://attacker.test",
        }),
      ),
    ).toBe(false);
  });
});

function request(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { method: "POST", headers });
}
