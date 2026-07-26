import { describe, expect, it } from "bun:test";
import {
  getImageStorageConfig,
  imageStorageIsConfigured,
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
});
