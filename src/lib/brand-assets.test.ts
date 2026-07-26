import { describe, expect, it } from "bun:test";
import { FACTORY_BRAND } from "@/lib/brand";

const brandAssetSets = [
  {
    brand: "Restofrontapp",
    folder: "restofrontapp",
  },
  {
    brand: "Cornershopdev",
    folder: "cornershopdev",
  },
] as const;

const assets = [
  { name: "logo-square.png", size: 1024 },
  { name: "mark.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
  { name: "favicon-32.png", size: 32 },
] as const;

async function readPngDimensions(folder: string, name: string) {
  const path = new URL(
    `../../public/brand/${folder}/${name}`,
    import.meta.url,
  );
  const bytes = await Bun.file(path).arrayBuffer();
  const view = new DataView(bytes);

  // PNG signature followed by the IHDR chunk, whose width and height are the
  // first two unsigned 32-bit integers in network byte order.
  expect(Array.from(new Uint8Array(bytes, 0, 8))).toEqual([
    137, 80, 78, 71, 13, 10, 26, 10,
  ]);

  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
    // PNG color type 6 is truecolor with alpha. Keeping this at the file-header
    // level makes the check independent of an image-decoding test dependency.
    colorType: view.getUint8(25),
  };
}

describe("production brand assets", () => {
  for (const identity of brandAssetSets) {
    it(`keeps every ${identity.brand} PNG square, transparent, and correctly sized`, async () => {
      for (const asset of assets) {
        await expect(
          readPngDimensions(identity.folder, asset.name),
        ).resolves.toEqual({
          width: asset.size,
          height: asset.size,
          colorType: 6,
        });
      }
    });
  }

  it("registers the selected Cornershopdev mark for UI and browser chrome", () => {
    expect(FACTORY_BRAND).toEqual({
      name: "Cornershopdev",
      initials: "CS",
      mark: {
        src: "/brand/cornershopdev/mark.png",
        faviconSrc: "/brand/cornershopdev/favicon-32.png",
        appleTouchIconSrc: "/brand/cornershopdev/apple-touch-icon.png",
      },
    });
  });
});
