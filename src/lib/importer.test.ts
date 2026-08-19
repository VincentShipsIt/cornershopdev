import { describe, expect, it } from "bun:test";
import {
  assertPublicUrl,
  isPrivateAddress,
  resolvePublicAddresses,
} from "@/lib/importer";

describe("importer SSRF guards", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.5",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "0.0.0.0",
    "100.64.1.1",
    "198.18.0.1",
    "224.0.0.1",
    "::1",
    "fe80::1",
    "fe90::1",
    "febf::1",
    "fc00::1",
    "fd12:3456::1",
    "2001:db8::1",
    "::ffff:127.0.0.1",
    "::ffff:10.1.2.3",
    "::7f00:1",
    "::127.0.0.1",
  ])("treats %s as private", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "93.184.216.34",
    "2001:4860:4860::8888",
    "::ffff:8.8.8.8",
  ])("treats %s as public", (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });

  it("rejects non-http protocols", async () => {
    await expect(assertPublicUrl(new URL("file:///etc/passwd"))).rejects.toThrow(
      /http/i,
    );
    await expect(assertPublicUrl(new URL("ftp://example.com"))).rejects.toThrow(
      /http/i,
    );
  });

  it("rejects localhost and local TLDs", async () => {
    await expect(
      assertPublicUrl(new URL("http://localhost/admin")),
    ).rejects.toThrow(/local/i);
    await expect(
      assertPublicUrl(new URL("http://app.localhost/")),
    ).rejects.toThrow(/local/i);
    await expect(
      assertPublicUrl(new URL("http://printer.local/")),
    ).rejects.toThrow(/local/i);
    await expect(
      assertPublicUrl(new URL("http://metadata.google.internal/")),
    ).rejects.toThrow(/local/i);
  });

  it("rejects literal private IP hosts", async () => {
    await expect(
      assertPublicUrl(new URL("http://127.0.0.1/")),
    ).rejects.toThrow(/private/i);
    await expect(
      assertPublicUrl(new URL("http://169.254.169.254/latest/meta-data/")),
    ).rejects.toThrow(/private/i);
    await expect(
      assertPublicUrl(new URL("http://[::1]/")),
    ).rejects.toThrow(/private/i);
    await expect(
      assertPublicUrl(new URL("http://[::7f00:1]/")),
    ).rejects.toThrow(/private/i);
    await expect(
      assertPublicUrl(new URL("http://[fe90::1]/")),
    ).rejects.toThrow(/private/i);
  });

  it("returns public literal addresses for pin-after-resolve", async () => {
    await expect(resolvePublicAddresses("8.8.8.8")).resolves.toEqual([
      "8.8.8.8",
    ]);
    await expect(resolvePublicAddresses("169.254.169.254")).rejects.toThrow(
      /private/i,
    );
  });
});
