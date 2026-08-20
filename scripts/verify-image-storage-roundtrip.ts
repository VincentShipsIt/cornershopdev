import { createHash } from "node:crypto";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  getImageStorageConfig,
  storageObjectKeyFromUrl,
  storeSiteImage,
} from "@/lib/storage/images";
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
      purpose: "original-hero" as const,
      data: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X2NDWQAAAABJRU5ErkJggg==",
        "base64",
      ),
    },
    {
      label: "enhanced",
      purpose: "hero" as const,
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
    for (const fixture of fixtures) {
      const storedUrl = await storeSiteImage({
        siteSlug: `storage-verification-${environment}`,
        vertical: "RESTAURANT",
        data: fixture.data,
        mediaType: "image/png",
        purpose: fixture.purpose,
      });
      const key = storageObjectKeyFromUrl(storedUrl);
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
