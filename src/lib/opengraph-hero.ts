import { fetchPublicImage } from "@/lib/importer";

const MAX_OPENGRAPH_HERO_BYTES = 4 * 1024 * 1024;
const OPENGRAPH_HERO_MEDIA_TYPES = new Set([
  "image/avif",
  "image/jpeg",
  "image/png",
  "image/webp",
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
      !OPENGRAPH_HERO_MEDIA_TYPES.has(image.mediaType)
    ) {
      return null;
    }
    return `data:${image.mediaType};base64,${Buffer.from(image.data).toString("base64")}`;
  } catch {
    return null;
  }
}
