import { describe, expect, it } from "bun:test";
import {
  evaluatePlatformDnsProbes,
  platformDnsProbeHostnames,
  platformTlsProbeHostnames,
} from "@/lib/platform-edge-readiness";

const deployedSha = "0123456789abcdef0123456789abcdef01234567";

describe("platform edge release probes", () => {
  it("checks a release-specific wildcard label under every platform parent", () => {
    expect(platformDnsProbeHostnames(deployedSha, "")).toEqual([
      "release-0123456789ab.cornershop.dev",
      "release-0123456789ab.restofront.com",
    ]);
  });

  it("requires every wildcard answer to include the configured application IP", () => {
    const hostnames = platformDnsProbeHostnames(deployedSha, "");
    expect(
      evaluatePlatformDnsProbes(
        hostnames,
        "52.8.153.188",
        new Map([
          [hostnames[0], ["52.8.153.188"]],
          [hostnames[1], ["52.8.153.188", "52.8.153.189"]],
        ]),
      ).ready,
    ).toBe(true);

    const failed = evaluatePlatformDnsProbes(
      hostnames,
      "52.8.153.188",
      new Map([[hostnames[0], ["52.8.153.188"]]]),
    );
    expect(failed.ready).toBe(false);
    expect(failed.probes[1]).toMatchObject({ addresses: [], ready: false });
  });

  it("builds stable TLS probes from a persisted site without claiming customer acceptance", () => {
    expect(platformTlsProbeHostnames("le-petit-meunier", "")).toEqual([
      "le-petit-meunier.cornershop.dev",
      "le-petit-meunier.restofront.com",
    ]);
    expect(() => platformTlsProbeHostnames("not.a.slug", "")).toThrow();
  });

  it("rejects partial SHAs and invalid configured addresses", () => {
    expect(() => platformDnsProbeHostnames("0123456", "")).toThrow();
    expect(() =>
      evaluatePlatformDnsProbes([], "999.1.1.1", new Map()),
    ).toThrow();
  });
});
