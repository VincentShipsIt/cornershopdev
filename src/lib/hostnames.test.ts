import { describe, expect, it } from "bun:test";
import { isFactoryHostname, platformHostnames } from "@/lib/hostnames";

describe("platformHostnames", () => {
  it("defaults to the factory's own domains", () => {
    expect([...platformHostnames({})].sort()).toEqual([
      "api.cornershop.dev",
      "cornershop.dev",
      "domains.cornershop.dev",
      "www.cornershop.dev",
    ]);
  });

  it("takes an override, trimmed and lowercased", () => {
    expect([
      ...platformHostnames({ PLATFORM_HOSTNAMES: " Staging.Example.com , " }),
    ]).toEqual(["staging.example.com"]);
  });

  // deploy.sh drops empty parameters, but a half-filled `.env` would otherwise
  // leave the factory answering for no hostname at all.
  it("falls back when the override is blank", () => {
    expect(platformHostnames({ PLATFORM_HOSTNAMES: "" }).size).toBe(4);
  });
});

/**
 * This is the gate Caddy asks before issuing a certificate under on-demand TLS.
 * A false negative means a domain that resolves but never serves; a false
 * positive means anyone pointing DNS at the box can mint a certificate on it.
 */
describe("isFactoryHostname", () => {
  it("claims the factory's own domains", () => {
    expect(isFactoryHostname("cornershop.dev", {})).toBe(true);
    expect(isFactoryHostname("api.cornershop.dev", {})).toBe(true);
  });

  it("claims a registered niche domain the registry knows", () => {
    expect(isFactoryHostname("restofront.com", {})).toBe(true);
    expect(isFactoryHostname("www.restofront.com", {})).toBe(true);
  });

  it("normalises case and port", () => {
    expect(isFactoryHostname("RestoFront.com:443", {})).toBe(true);
  });

  /**
   * Everything here has to stay a 403 so it falls through to the domain table:
   * a customer's verified domain is authorized by being verified, and an
   * unverified one must not be authorized at all.
   */
  it("claims nothing else", () => {
    expect(isFactoryHostname("pizzeria-luigi.com", {})).toBe(false);
    expect(isFactoryHostname("notcornershop.dev", {})).toBe(false);
    expect(isFactoryHostname("cornershop.dev.evil.com", {})).toBe(false);
    expect(isFactoryHostname("", {})).toBe(false);
  });
});
