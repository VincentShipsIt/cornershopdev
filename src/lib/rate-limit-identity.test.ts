import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { normalizeAccountEmail } from "@/lib/account-email";
import {
  clientIpFromHeaders,
  rateLimitIdentityKey,
} from "@/lib/rate-limit";

describe("rate limit IP identity", () => {
  it("prefers Caddy-set X-Real-IP over X-Forwarded-For", () => {
    const headers = new Headers({
      "x-real-ip": "203.0.113.10",
      "x-forwarded-for": "198.51.100.1, 203.0.113.10",
    });
    expect(clientIpFromHeaders(headers)).toBe("203.0.113.10");
  });

  it("ignores a blank X-Real-IP and uses X-Forwarded-For", () => {
    const headers = new Headers({
      "x-real-ip": "   ",
      "x-forwarded-for": "198.51.100.1, 203.0.113.10",
    });
    expect(clientIpFromHeaders(headers)).toBe("198.51.100.1");
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

  it("gives normalized email its own privacy-safe magic-link bucket", () => {
    const email = "owner@example.test";
    const ipKey = rateLimitIdentityKey("magic-link-ip", "203.0.113.10");
    const emailKey = rateLimitIdentityKey("magic-link-email", email);

    expect(ipKey).not.toBe(emailKey);
    expect(emailKey).toStartWith("cornershopdev:magic-link-email:");
    expect(emailKey).not.toContain(email);
    expect(emailKey).toBe(
      rateLimitIdentityKey(
        "magic-link-email",
        normalizeAccountEmail("  OWNER@EXAMPLE.TEST "),
      ),
    );
  });
});
