import sharp from "sharp";

export const MAX_PHOTO_IMAGE_BYTES = 12_000_000;
export const MAX_PHOTO_IMAGE_DIMENSION = 12_000;
export const MAX_PHOTO_IMAGE_PIXELS = 40_000_000;

export class PhotoImageValidationError extends Error {
  constructor(readonly code: "IMAGE_TOO_LARGE" | "INVALID_IMAGE_OUTPUT") {
    super(
      code === "IMAGE_TOO_LARGE"
        ? "The image is larger than 12 MB"
        : "The image is not a supported, decodable JPEG, PNG, WebP, or AVIF",
    );
    this.name = "PhotoImageValidationError";
  }
}

export function detectSupportedImageMediaType(
  data: Uint8Array,
): "image/jpeg" | "image/png" | "image/webp" | "image/avif" | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    data.length >= 8 &&
    Buffer.from(data.subarray(0, 8)).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
    return "image/png";
  }
  if (
    data.length >= 12 &&
    Buffer.from(data.subarray(0, 4)).toString("ascii") === "RIFF" &&
    Buffer.from(data.subarray(8, 12)).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (
    data.length >= 12 &&
    Buffer.from(data.subarray(4, 8)).toString("ascii") === "ftyp" &&
    /^(?:avif|avis)$/.test(Buffer.from(data.subarray(8, 12)).toString("ascii"))
  ) {
    return "image/avif";
  }
  return null;
}

export async function validatePhotoImageBytes(input: {
  data: Uint8Array;
  claimedMediaType: string;
}): Promise<{
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/avif";
  width: number;
  height: number;
}> {
  if (input.data.byteLength > MAX_PHOTO_IMAGE_BYTES) {
    throw new PhotoImageValidationError("IMAGE_TOO_LARGE");
  }
  const mediaType = detectSupportedImageMediaType(input.data);
  const claimedMediaType = input.claimedMediaType
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (!mediaType || claimedMediaType !== mediaType) {
    throw new PhotoImageValidationError("INVALID_IMAGE_OUTPUT");
  }
  try {
    const metadata = await sharp(input.data, {
      failOn: "warning",
      limitInputPixels: MAX_PHOTO_IMAGE_PIXELS,
    }).metadata();
    const supportedFormat =
      metadata.format === mediaType.slice("image/".length) ||
      (mediaType === "image/jpeg" && metadata.format === "jpeg") ||
      (mediaType === "image/avif" &&
        metadata.format === "heif" &&
        metadata.compression === "av1");
    const width = metadata.width;
    const height = metadata.height;
    if (
      !supportedFormat ||
      !width ||
      !height ||
      width > MAX_PHOTO_IMAGE_DIMENSION ||
      height > MAX_PHOTO_IMAGE_DIMENSION ||
      width * height > MAX_PHOTO_IMAGE_PIXELS
    ) {
      throw new PhotoImageValidationError("INVALID_IMAGE_OUTPUT");
    }
    return { mediaType, width, height };
  } catch (error) {
    if (error instanceof PhotoImageValidationError) throw error;
    throw new PhotoImageValidationError("INVALID_IMAGE_OUTPUT");
  }
}
