import { describe, expect, it } from "bun:test";
import sharp from "sharp";
import {
  detectSupportedImageMediaType,
  MAX_PHOTO_IMAGE_BYTES,
  validatePhotoImageBytes,
} from "@/lib/photo-image-validation";

describe("photo image byte validation", () => {
  it("accepts decodable bounded JPEG, PNG, WebP, and AVIF bytes", async () => {
    for (const format of ["jpeg", "png", "webp", "avif"] as const) {
      const data = await sharp({
        create: {
          width: 2,
          height: 3,
          channels: 3,
          background: "#6688aa",
        },
      })
        .toFormat(format)
        .toBuffer();
      await expect(
        validatePhotoImageBytes({
          data,
          claimedMediaType: `image/${format}`,
        }),
      ).resolves.toMatchObject({ width: 2, height: 3 });
    }
  });

  it("recognizes AVIF magic while rejecting malformed or mismatched bytes", async () => {
    expect(
      detectSupportedImageMediaType(
        Buffer.from([0, 0, 0, 20, 102, 116, 121, 112, 97, 118, 105, 102]),
      ),
    ).toBe("image/avif");
    const png = await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 3,
        background: "#000000",
      },
    })
      .png()
      .toBuffer();
    await expect(
      validatePhotoImageBytes({ data: png, claimedMediaType: "image/jpeg" }),
    ).rejects.toThrow("supported, decodable");
    await expect(
      validatePhotoImageBytes({
        data: Buffer.from("RIFF0000WEBP", "ascii"),
        claimedMediaType: "image/webp",
      }),
    ).rejects.toThrow("supported, decodable");
  });

  it("rejects bytes and dimensions above the public-storage boundary", async () => {
    await expect(
      validatePhotoImageBytes({
        data: new Uint8Array(MAX_PHOTO_IMAGE_BYTES + 1),
        claimedMediaType: "image/png",
      }),
    ).rejects.toThrow("larger than 12 MB");
    const tooWide = await sharp({
      create: {
        width: 12_001,
        height: 1,
        channels: 3,
        background: "#000000",
      },
    })
      .png()
      .toBuffer();
    await expect(
      validatePhotoImageBytes({
        data: tooWide,
        claimedMediaType: "image/png",
      }),
    ).rejects.toThrow("supported, decodable");
  });
});
