import { describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const { detectSupportedImageMediaType } = await import("@/lib/photo-library");

describe("photo library binary validation", () => {
  it("detects supported image signatures rather than trusting upload headers", () => {
    expect(
      detectSupportedImageMediaType(
        Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00]),
      ),
    ).toBe("image/jpeg");
    expect(
      detectSupportedImageMediaType(
        Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe("image/png");
    expect(
      detectSupportedImageMediaType(
        Buffer.from("RIFF0000WEBP", "ascii"),
      ),
    ).toBe("image/webp");
  });

  it("rejects executable and malformed content", () => {
    expect(detectSupportedImageMediaType(Buffer.from("<script>"))).toBeNull();
  });
});
