import { createHash } from "node:crypto";
import {
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  getImageStorageConfig,
  storeImmutableEnhancedPhoto,
  storeImmutableSiteOriginal,
  storageObjectKeyFromUrl,
} from "@/lib/storage/images";
import { deleteAndVerifyObjectVersions } from "@/lib/storage/versioned-cleanup";
import {
  imageStorageVerificationFailure,
  type ImageStorageCleanupStatus,
} from "@/lib/image-storage-verification";

class SafeVerificationError extends Error {
  constructor(
    readonly code: string,
    readonly cleanup: ImageStorageCleanupStatus | "unknown",
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
  let cleanup: ImageStorageCleanupStatus = "not-required";

  try {
    const original = await storeImmutableSiteOriginal({
      siteSlug: `storage-verification-${environment}`,
      vertical: "RESTAURANT",
      data: fixtures[0]!.data,
      mediaType: "image/png",
    });
    keys.push(storageObjectKeyFromUrl(original.url));
    const enhanced = await storeImmutableEnhancedPhoto({
      siteSlug: `storage-verification-${environment}`,
      vertical: "RESTAURANT",
      sourceSha256: original.sha256,
      configVersion: "f".repeat(16),
      data: fixtures[1]!.data,
      mediaType: "image/png",
    });
    const enhancedKey = storageObjectKeyFromUrl(enhanced.url);
    if (keys.includes(enhancedKey)) {
      throw new SafeVerificationError("duplicate_object_key", "unknown");
    }
    keys.push(enhancedKey);
    const stored = [
      { ...fixtures[0]!, key: keys[0]! },
      { ...fixtures[1]!, key: enhancedKey },
    ];
    for (const fixture of stored) {
      const response = await client.send(
        new GetObjectCommand({ Bucket: config.bucket, Key: fixture.key }),
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
        await deleteAndVerifyObjectVersions({
          client,
          bucket: config.bucket,
          keys,
        });
        cleanup = "completed";
      } catch {
        cleanup = "failed";
      }
    }
  }

  const verificationFailure = imageStorageVerificationFailure({
    primaryFailure: failure,
    cleanup,
    completedChecks: checks.length,
    expectedChecks: fixtures.length,
  });
  if (verificationFailure) {
    throw new SafeVerificationError(
      verificationFailure.failure,
      verificationFailure.cleanup,
    );
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
