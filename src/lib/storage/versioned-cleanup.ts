import {
  DeleteObjectsCommand,
  ListObjectVersionsCommand,
  type S3Client,
} from "@aws-sdk/client-s3";

type VersionedObjectReference = { Key: string; VersionId: string };
type S3Sender = Pick<S3Client, "send">;

export async function deleteAndVerifyObjectVersions(input: {
  client: S3Sender;
  bucket: string;
  keys: string[];
}): Promise<{ deletedVersions: number }> {
  const keys = [...new Set(input.keys)];
  const references = (
    await Promise.all(
      keys.map((key) => listExactObjectVersions(input.client, input.bucket, key)),
    )
  ).flat();
  if (references.length === 0 || keys.some((key) => !references.some((item) => item.Key === key))) {
    throw new Error("Every verification object must expose an exact S3 version");
  }

  for (let offset = 0; offset < references.length; offset += 1_000) {
    const response = await input.client.send(
      new DeleteObjectsCommand({
        Bucket: input.bucket,
        Delete: { Objects: references.slice(offset, offset + 1_000), Quiet: true },
      }),
    );
    if (response.Errors?.length) {
      throw new Error("S3 version cleanup reported deletion errors");
    }
  }

  const remaining = (
    await Promise.all(
      keys.map((key) => listExactObjectVersions(input.client, input.bucket, key)),
    )
  ).flat();
  if (remaining.length > 0) {
    throw new Error("S3 version cleanup left object versions or delete markers behind");
  }
  return { deletedVersions: references.length };
}

async function listExactObjectVersions(
  client: S3Sender,
  bucket: string,
  key: string,
): Promise<VersionedObjectReference[]> {
  const references: VersionedObjectReference[] = [];
  let keyMarker: string | undefined;
  let versionIdMarker: string | undefined;
  do {
    const response = await client.send(
      new ListObjectVersionsCommand({
        Bucket: bucket,
        Prefix: key,
        KeyMarker: keyMarker,
        VersionIdMarker: versionIdMarker,
      }),
    );
    for (const item of [...(response.Versions ?? []), ...(response.DeleteMarkers ?? [])]) {
      if (item.Key === key && item.VersionId) {
        references.push({ Key: item.Key, VersionId: item.VersionId });
      }
    }
    if (!response.IsTruncated) break;
    if (!response.NextKeyMarker) {
      throw new Error("S3 version listing was truncated without a continuation marker");
    }
    keyMarker = response.NextKeyMarker;
    versionIdMarker = response.NextVersionIdMarker;
  } while (true);
  return references;
}
