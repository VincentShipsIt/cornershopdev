import { describe, expect, it } from "bun:test";
import {
  isFactoryHostname,
  isOnDemandTlsHostname,
  isReservedPlatformHostname,
  parsePlatformSubdomain,
  platformHostnames,
  platformSiteHostname,
  platformSubdomainParents,
  requestHostname,
} from "@/lib/hostnames";

// Every call passes the override explicitly. Omitting it reads
// `process.env.PLATFORM_HOSTNAMES`, which would make these assertions depend on
// whatever the machine running them happens to export; `""` pins the default set.
describe("platformHostnames", () => {
  // Blank rather than absent on purpose: deploy.sh drops empty parameters, so a
  // half-filled `.env` would otherwise leave the factory answering for no
  // hostname at all.
  it("defaults to the factory's own domains when the override is blank", () => {
    expect([...platformHostnames("")].sort()).toEqual([
      "api.cornershop.dev",
      "cornershop.dev",
      "domains.cornershop.dev",
      "www.cornershop.dev",
    ]);
  });

  it("takes an override, trimmed and lowercased", () => {
    expect([...platformHostnames(" Staging.Example.com , ")]).toEqual([
      "staging.example.com",
    ]);
  });
});

describe("requestHostname", () => {
  it("prefers the first forwarded hostname and normalizes it", () => {
    expect(
      requestHostname(
        new Headers({
          host: "internal:3000",
          "x-forwarded-host": " BISTRO.EXAMPLE:443, proxy.internal ",
        }),
      ),
    ).toBe("bistro.example");
  });

  it("falls back to host and rejects an absent value", () => {
    expect(requestHostname(new Headers({ host: "Cafe.Example:443" }))).toBe(
      "cafe.example",
    );
    expect(requestHostname(new Headers())).toBe("");
  });
});

/**
 * This is the gate Caddy asks before issuing a certificate under on-demand TLS.
 * A false negative means a domain that resolves but never serves; a false
 * positive means anyone pointing DNS at the box can mint a certificate on it.
 */
describe("isFactoryHostname", () => {
  it("claims the factory's own domains", () => {
    expect(isFactoryHostname("cornershop.dev", "")).toBe(true);
    expect(isFactoryHostname("api.cornershop.dev", "")).toBe(true);
  });

  it("claims a registered niche domain the registry knows", () => {
    expect(isFactoryHostname("restofront.com", "")).toBe(true);
    expect(isFactoryHostname("www.restofront.com", "")).toBe(true);
  });

  it("normalises case and port", () => {
    expect(isFactoryHostname("RestoFront.com:443", "")).toBe(true);
  });

  /**
   * Everything here has to stay a 403 so it falls through to the domain table:
   * a customer's verified domain is authorized by being verified, and an
   * unverified one must not be authorized at all.
   */
  it("claims nothing else", () => {
    expect(isFactoryHostname("pizzeria-luigi.com", "")).toBe(false);
    expect(isFactoryHostname("notcornershop.dev", "")).toBe(false);
    expect(isFactoryHostname("cornershop.dev.evil.com", "")).toBe(false);
    expect(isFactoryHostname("le-petit-meunier.restofront.com", "")).toBe(
      false,
    );
    expect(isFactoryHostname("", "")).toBe(false);
  });
});

describe("platform subdomains", () => {
  it("derives parents from launched niche domains and the factory apex", () => {
    expect(platformSubdomainParents("")).toEqual([
      "cornershop.dev",
      "restofront.com",
    ]);
    expect(platformSiteHostname("chez-lea", "RESTAURANT", "")).toBe(
      "chez-lea.restofront.com",
    );
    expect(platformSiteHostname("atelier-coupe", "BEAUTY", "")).toBe(
      "atelier-coupe.cornershop.dev",
    );
  });

  it("parses a customer slug under a launched niche or the factory apex", () => {
    expect(parsePlatformSubdomain("Chez-Lea.RestoFront.com:443", "")).toEqual({
      slug: "chez-lea",
      parentHostname: "restofront.com",
    });
    expect(parsePlatformSubdomain("chez-lea.cornershop.dev", "")).toEqual({
      slug: "chez-lea",
      parentHostname: "cornershop.dev",
    });
  });

  it("never treats apex, reserved, or extra labels as a customer slug", () => {
    expect(parsePlatformSubdomain("restofront.com", "")).toBeNull();
    expect(parsePlatformSubdomain("www.restofront.com", "")).toBeNull();
    expect(parsePlatformSubdomain("api.restofront.com", "")).toBeNull();
    expect(parsePlatformSubdomain("assets.restofront.com", "")).toBeNull();
    expect(parsePlatformSubdomain("domains.restofront.com", "")).toBeNull();
    expect(parsePlatformSubdomain("send.restofront.com", "")).toBeNull();
    expect(parsePlatformSubdomain("foo.bar.restofront.com", "")).toBeNull();
    expect(parsePlatformSubdomain("www.cornershop.dev", "")).toBeNull();
    expect(isReservedPlatformHostname("api.restofront.com", "")).toBe(true);
    expect(isReservedPlatformHostname("send.restofront.com", "")).toBe(true);
    expect(isReservedPlatformHostname("chez-lea.restofront.com", "")).toBe(
      false,
    );
  });
});

/**
 * This is the gate Caddy asks before issuing a certificate under on-demand TLS.
 * Apex and www stay 200 so the factory and niche marketing sites keep serving.
 * A customer slug is 200 even if the Site row does not exist yet, so a brand-new
 * publish can obtain a cert. Arbitrary extra labels and unrelated hosts stay 403.
 */
describe("isOnDemandTlsHostname", () => {
  it("authorizes factory, niche apex/www, and customer platform slugs", () => {
    expect(isOnDemandTlsHostname("cornershop.dev", "")).toBe(true);
    expect(isOnDemandTlsHostname("www.cornershop.dev", "")).toBe(true);
    expect(isOnDemandTlsHostname("restofront.com", "")).toBe(true);
    expect(isOnDemandTlsHostname("www.restofront.com", "")).toBe(true);
    expect(isOnDemandTlsHostname("le-petit-meunier.restofront.com", "")).toBe(
      true,
    );
    expect(isOnDemandTlsHostname("le-petit-meunier.cornershop.dev", "")).toBe(
      true,
    );
  });

  it("does not authorize unrelated hosts or extra labels", () => {
    expect(isOnDemandTlsHostname("not-a-site.evil.com", "")).toBe(false);
    expect(isOnDemandTlsHostname("pizzeria-luigi.com", "")).toBe(false);
    expect(isOnDemandTlsHostname("foo.bar.restofront.com", "")).toBe(false);
    expect(isOnDemandTlsHostname("cornershop.dev.evil.com", "")).toBe(false);
  });

  it("does not accidentally open operator hosts on a niche domain", () => {
    expect(isOnDemandTlsHostname("api.restofront.com", "")).toBe(false);
    expect(isOnDemandTlsHostname("assets.restofront.com", "")).toBe(false);
    expect(isOnDemandTlsHostname("domains.restofront.com", "")).toBe(false);
    expect(isOnDemandTlsHostname("send.restofront.com", "")).toBe(false);
    expect(isOnDemandTlsHostname("api.cornershop.dev", "")).toBe(true);
    expect(isOnDemandTlsHostname("domains.cornershop.dev", "")).toBe(true);
  });
});
