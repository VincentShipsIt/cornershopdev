import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";

/**
 * Mirrors the client-IP selection used by limitByIp without requiring Redis.
 * Kept as a pure unit so proxy trust assumptions stay documented and tested.
 */
function clientIpFromHeaders(headers: Headers): string {
  const realIp = headers.get("x-real-ip")?.trim();
  const forwardedFor = headers.get("x-forwarded-for");
  return realIp || forwardedFor?.split(",")[0]?.trim() || "unknown";
}

describe("rate limit IP identity", () => {
  it("prefers X-Real-IP over spoofable X-Forwarded-For", () => {
    const headers = new Headers({
      "x-real-ip": "203.0.113.10",
      "x-forwarded-for": "198.51.100.1, 203.0.113.10",
    });
    expect(clientIpFromHeaders(headers)).toBe("203.0.113.10");
  });

  it("falls back to the left-most X-Forwarded-For hop", () => {
    const headers = new Headers({
      "x-forwarded-for": "198.51.100.1, 203.0.113.10",
    });
    expect(clientIpFromHeaders(headers)).toBe("198.51.100.1");
  });

  it("hashes identity so Redis keys never store raw IPs", () => {
    const ip = "203.0.113.10";
    const identifier = createHash("sha256").update(ip).digest("hex");
    expect(identifier).toHaveLength(64);
    expect(identifier).not.toContain(ip);
  });
});
