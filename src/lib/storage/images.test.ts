import { describe, expect, it } from "bun:test";
import {
  enhancedPhotoObjectKey,
  getImageStorageConfig,
  imageStorageIsConfigured,
  immutableOriginalObjectKey,
  storageObjectKeyFromUrl,
} from "@/lib/storage/images";

describe("image storage configuration", () => {
  it("normalizes the public base URL", () => {
    expect(
      getImageStorageConfig({
        AWS_REGION: "us-west-1",
        S3_BUCKET: "assets.cornershop.dev",
        S3_PUBLIC_BASE_URL: "https://assets.cornershop.dev/",
      }),
    ).toEqual({
      region: "us-west-1",
      bucket: "assets.cornershop.dev",
      publicBaseUrl: "https://assets.cornershop.dev",
    });
  });

  it("requires every runtime value", () => {
    expect(
      imageStorageIsConfigured({ S3_BUCKET: "assets.cornershop.dev" }),
    ).toBe(false);
    expect(() =>
      getImageStorageConfig({ S3_BUCKET: "assets.cornershop.dev" }),
    ).toThrow("S3_BUCKET, S3_PUBLIC_BASE_URL, and AWS_REGION");
  });

  it("derives only keys inside the configured public base", () => {
    const env = {
      AWS_REGION: "us-west-1",
      S3_BUCKET: "assets.cornershop.dev",
      S3_PUBLIC_BASE_URL: "https://assets.cornershop.dev/images",
    };
    expect(
      storageObjectKeyFromUrl(
        "https://assets.cornershop.dev/images/restofront/sites/test/hero.png",
        env,
      ),
    ).toBe("restofront/sites/test/hero.png");
    expect(() =>
      storageObjectKeyFromUrl("https://attacker.example/hero.png", env),
    ).toThrow("outside");
  });

  it("builds content-addressed immutable original and derivative keys", () => {
    const digest = "a".repeat(64);
    expect(
      immutableOriginalObjectKey({
        siteSlug: "osteria-luna",
        vertical: "RESTAURANT",
        sha256: digest,
        mediaType: "image/jpeg",
      }),
    ).toBe(
      `restofrontcom/sites/osteria-luna/originals/${digest}.jpg`,
    );
    expect(
      enhancedPhotoObjectKey({
        siteSlug: "osteria-luna",
        vertical: "RESTAURANT",
        sourceSha256: digest,
        configVersion: "b".repeat(16),
        mediaType: "image/webp",
      }),
    ).toBe(
      `restofrontcom/sites/osteria-luna/enhanced/${digest}-${"b".repeat(16)}.webp`,
    );
  });

  it("rejects unsafe immutable key material", () => {
    expect(() =>
      immutableOriginalObjectKey({
        siteSlug: "test",
        vertical: "RESTAURANT",
        sha256: "../escape",
        mediaType: "image/png",
      }),
    ).toThrow("SHA-256");
  });
});
