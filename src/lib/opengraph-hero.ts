import sharp from "sharp";
import { fetchPublicImage } from "@/lib/importer";

const MAX_OPENGRAPH_HERO_BYTES = 4 * 1024 * 1024;
const MAX_OPENGRAPH_HERO_PIXELS = 40_000_000;
const OPENGRAPH_HERO_FORMATS = new Map([
  ["image/avif", "heif"],
  ["image/jpeg", "jpeg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

type PublicImageFetcher = typeof fetchPublicImage;

/**
 * Converts an authenticated public image fetch into the self-contained source
 * required by ImageResponse. The importer boundary performs DNS/IP pinning,
 * validates every redirect, and enforces its own timeout/type/size ceilings;
 * this narrower consumer keeps the historical 4 MiB social-card limit too.
 */
export async function loadPublicHeroImageDataUrl(
  url: string,
  fetchImage: PublicImageFetcher = fetchPublicImage,
): Promise<string | null> {
  try {
    const image = await fetchImage(url);
    if (
      image.data.byteLength === 0 ||
      image.data.byteLength > MAX_OPENGRAPH_HERO_BYTES ||
      !OPENGRAPH_HERO_FORMATS.has(image.mediaType)
    ) {
      return null;
    }
    const pipeline = sharp(image.data, {
      failOn: "error",
      limitInputPixels: MAX_OPENGRAPH_HERO_PIXELS,
      sequentialRead: true,
    });
    const metadata = await pipeline.metadata();
    if (
      metadata.format !== OPENGRAPH_HERO_FORMATS.get(image.mediaType) ||
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > MAX_OPENGRAPH_HERO_PIXELS
    ) {
      return null;
    }
    const normalized = await pipeline
      .rotate()
      .resize(1_200, 630, { fit: "cover" })
      .flatten({ background: "#111111" })
      .jpeg({ quality: 85, progressive: false })
      .toBuffer();
    if (
      normalized.byteLength === 0 ||
      normalized.byteLength > MAX_OPENGRAPH_HERO_BYTES
    ) {
      return null;
    }
    return `data:image/jpeg;base64,${normalized.toString("base64")}`;
  } catch {
    return null;
  }
}
