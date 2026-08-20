import { createHash } from "node:crypto";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  getImageStorageConfig,
  storeImmutableEnhancedPhoto,
  storeImmutableSiteOriginal,
  storageObjectKeyFromUrl,
} from "@/lib/storage/images";

class SafeVerificationError extends Error {
  constructor(
    readonly code: string,
    readonly cleanup: "not-required" | "completed" | "failed" | "unknown",
  ) {
    super(code);
    this.name = "SafeVerificationError";
  }
}

try {
  const evidence = await verifyRoundTrip(process.argv.slice(2));
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  console.error(
    JSON.stringify({
      command: "verify-image-storage-roundtrip",
      verified: false,
      failure:
        error instanceof SafeVerificationError
          ? error.code
          : "configuration_or_provider_failure",
      cleanup:
        error instanceof SafeVerificationError ? error.cleanup : "unknown",
      failedAt: new Date().toISOString(),
    }),
  );
  process.exitCode = 1;
}

async function verifyRoundTrip(args: string[]) {
  const { environment, execute } = parseArguments(args);
  if (!execute) {
    throw new SafeVerificationError("execute_confirmation_required", "not-required");
  }
  const fixtures = [
    {
      label: "original",
      data: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X2NDWQAAAABJRU5ErkJggg==",
        "base64",
      ),
    },
    {
      label: "enhanced",
      data: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    },
  ];
  const config = getImageStorageConfig();
  const client = new S3Client({ region: config.region });
  const keys: string[] = [];
  const checks: Array<{ label: string; digest: string }> = [];
  let failure: string | null = null;
  let cleanup: "not-required" | "completed" | "failed" = "not-required";

  try {
    const original = await storeImmutableSiteOriginal({
      siteSlug: `storage-verification-${environment}`,
      vertical: "RESTAURANT",
      data: fixtures[0]!.data,
      mediaType: "image/png",
    });
    const enhanced = await storeImmutableEnhancedPhoto({
      siteSlug: `storage-verification-${environment}`,
      vertical: "RESTAURANT",
      sourceSha256: original.sha256,
      configVersion: "f".repeat(16),
      data: fixtures[1]!.data,
      mediaType: "image/png",
    });
    const stored = [
      { ...fixtures[0]!, storedUrl: original.url },
      { ...fixtures[1]!, storedUrl: enhanced.url },
    ];
    for (const fixture of stored) {
      const key = storageObjectKeyFromUrl(fixture.storedUrl);
      if (keys.includes(key)) {
        throw new SafeVerificationError("duplicate_object_key", "unknown");
      }
      keys.push(key);
      const response = await client.send(
        new GetObjectCommand({ Bucket: config.bucket, Key: key }),
      );
      const retrieved = await response.Body?.transformToByteArray();
      if (
        !retrieved ||
        !Buffer.from(retrieved).equals(Buffer.from(fixture.data))
      ) {
        failure = `${fixture.label}_content_mismatch`;
        break;
      }
      checks.push({
        label: fixture.label,
        digest: createHash("sha256").update(retrieved).digest("hex"),
      });
    }
  } catch {
    failure = "write_or_read_failed";
  } finally {
    if (keys.length > 0) {
      try {
        const deleted = await client.send(
          new DeleteObjectsCommand({
            Bucket: config.bucket,
            Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
          }),
        );
        cleanup = deleted.Errors?.length ? "failed" : "completed";
      } catch {
        cleanup = "failed";
      }
    }
  }

  if (cleanup === "failed") {
    throw new SafeVerificationError("cleanup_failed", cleanup);
  }
  if (failure || checks.length !== 2) {
    throw new SafeVerificationError(failure ?? "incomplete_roundtrip", cleanup);
  }
  return {
    command: "verify-image-storage-roundtrip",
    environment,
    verified: true,
    objectsVerified: checks,
    cleanup,
    verifiedAt: new Date().toISOString(),
  };
}

function parseArguments(args: string[]): {
  environment: "preview" | "production";
  execute: boolean;
} {
  let environment: "preview" | "production" | undefined;
  let execute = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--execute") {
      execute = true;
      continue;
    }
    if (argument === "--environment") {
      const value = args[index + 1];
      if (value !== "preview" && value !== "production") {
        throw new SafeVerificationError("invalid_environment", "not-required");
      }
      environment = value;
      index += 1;
      continue;
    }
    throw new SafeVerificationError("invalid_arguments", "not-required");
  }
  if (!environment) {
    throw new SafeVerificationError("invalid_environment", "not-required");
  }
  return { environment, execute };
}
