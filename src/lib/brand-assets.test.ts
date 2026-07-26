import { describe, expect, it } from "bun:test";

const restofrontappAssets = [
  { name: "logo-square.png", size: 1024 },
  { name: "mark.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
  { name: "favicon-32.png", size: 32 },
] as const;

async function readPngDimensions(name: string) {
  const path = new URL(
    `../../public/brand/restofrontapp/${name}`,
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

describe("Restofrontapp brand assets", () => {
  it("keeps every production PNG square, transparent, and correctly sized", async () => {
    for (const asset of restofrontappAssets) {
      await expect(readPngDimensions(asset.name)).resolves.toEqual({
        width: asset.size,
        height: asset.size,
        colorType: 6,
      });
    }
  });
});
