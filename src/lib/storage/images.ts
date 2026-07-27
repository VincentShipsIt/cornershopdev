import { randomUUID } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { verticalAssetNamespace } from "@/lib/verticals/registry";
import type { VerticalId } from "@/lib/verticals/types";

type Environment = Record<string, string | undefined>;

export function getImageStorageConfig(env: Environment = process.env) {
  const bucket = env.S3_BUCKET;
  const publicBaseUrl = env.S3_PUBLIC_BASE_URL?.replace(/\/$/, "");
  const region = env.AWS_REGION;
  if (!bucket || !publicBaseUrl || !region) {
    throw new Error(
      "S3_BUCKET, S3_PUBLIC_BASE_URL, and AWS_REGION must be configured",
    );
  }
  return { bucket, publicBaseUrl, region };
}

export function imageStorageIsConfigured(env: Environment = process.env) {
  return Boolean(env.S3_BUCKET && env.S3_PUBLIC_BASE_URL && env.AWS_REGION);
}

export function storageObjectKeyFromUrl(
  storedUrl: string,
  env: Environment = process.env,
): string {
  const { publicBaseUrl } = getImageStorageConfig(env);
  const base = new URL(`${publicBaseUrl}/`);
  const stored = new URL(storedUrl);
  if (stored.origin !== base.origin || !stored.pathname.startsWith(base.pathname)) {
    throw new Error("Stored image URL is outside the configured public base.");
  }
  const key = decodeURIComponent(stored.pathname.slice(base.pathname.length));
  if (!key || key.includes("..")) {
    throw new Error("Stored image URL does not contain a safe object key.");
  }
  return key;
}

export async function storeSiteImage(input: {
  siteSlug: string;
  vertical: VerticalId;
  data: Uint8Array;
  mediaType: string;
  purpose: "hero" | "catalog" | "original-hero";
}): Promise<string> {
  const { bucket, publicBaseUrl, region } = getImageStorageConfig();
  const extension =
    input.mediaType.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
  // One bucket serves every niche, so the niche's own folder comes first and a
  // site slug only has to be unique within it. Keys are only ever written here
  // and stored whole; changing the prefix leaves any object written under the
  // old one reachable by its already-stored URL.
  const key = `${verticalAssetNamespace(input.vertical)}/sites/${input.siteSlug}/${input.purpose}-${randomUUID()}.${extension}`;
  const s3 = new S3Client({ region });
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: input.data,
      ContentType: input.mediaType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return `${publicBaseUrl}/${key}`;
}
