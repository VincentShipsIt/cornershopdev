import { describe, expect, it, mock } from "bun:test";
import { loadPublicHeroImageDataUrl } from "@/lib/opengraph-hero";

const opengraphRoute = await Bun.file(
  new URL("../app/preview/[slug]/opengraph-image.tsx", import.meta.url),
).text();

describe("Open Graph remote hero boundary", () => {
  it("routes the metadata image through the bounded public-image fetcher", async () => {
    const fetchImage = mock(async () => ({
      data: new TextEncoder().encode("public image"),
      mediaType: "image/png",
    }));

    await expect(
      loadPublicHeroImageDataUrl("https://images.example/hero.png", fetchImage),
    ).resolves.toBe("data:image/png;base64,cHVibGljIGltYWdl");
    expect(fetchImage).toHaveBeenCalledTimes(1);
    expect(opengraphRoute).toContain("loadPublicHeroImageDataUrl");
    expect(opengraphRoute).not.toMatch(/\bfetch\s*\(/);
  });

  it.each([
    ["private IP", "Private network addresses are not supported"],
    [
      "redirect to private IP",
      "Private network addresses are not supported after redirect",
    ],
    ["DNS failure", "The website could not be resolved"],
    ["timeout", "The operation was aborted due to timeout"],
  ])("falls back without an unrestricted retry after %s rejection", async (_case, message) => {
    const fetchImage = mock(async () => {
      throw new Error(message);
    });

    await expect(
      loadPublicHeroImageDataUrl("https://images.example/hero.png", fetchImage),
    ).resolves.toBeNull();
    expect(fetchImage).toHaveBeenCalledTimes(1);
  });

  it("rejects a private literal through the real public-image boundary", async () => {
    await expect(
      loadPublicHeroImageDataUrl("http://127.0.0.1/private.png"),
    ).resolves.toBeNull();
  });

  it("rejects oversized, empty, and unsupported image responses", async () => {
    const oversized = new Uint8Array(4 * 1024 * 1024 + 1);
    await expect(
      loadPublicHeroImageDataUrl(
        "https://images.example/large.png",
        async () => ({ data: oversized, mediaType: "image/png" }),
      ),
    ).resolves.toBeNull();
    await expect(
      loadPublicHeroImageDataUrl(
        "https://images.example/empty.png",
        async () => ({ data: new Uint8Array(), mediaType: "image/png" }),
      ),
    ).resolves.toBeNull();
    await expect(
      loadPublicHeroImageDataUrl(
        "https://images.example/vector.svg",
        async () => ({
          data: new TextEncoder().encode("<svg></svg>"),
          mediaType: "image/svg+xml",
        }),
      ),
    ).resolves.toBeNull();
  });
});
