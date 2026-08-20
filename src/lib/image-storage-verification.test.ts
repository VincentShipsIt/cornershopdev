import { describe, expect, it } from "bun:test";
import { imageStorageVerificationFailure } from "@/lib/image-storage-verification";

describe("image storage round-trip diagnostics", () => {
  it("preserves primary and cleanup failure evidence together", () => {
    expect(
      imageStorageVerificationFailure({
        primaryFailure: "original_content_mismatch",
        cleanup: "failed",
        completedChecks: 0,
        expectedChecks: 2,
      }),
    ).toEqual({
      failure: "original_content_mismatch",
      cleanup: "failed",
    });
  });

  it("reports cleanup-only and incomplete verification failures", () => {
    expect(
      imageStorageVerificationFailure({
        primaryFailure: null,
        cleanup: "failed",
        completedChecks: 2,
        expectedChecks: 2,
      }),
    ).toEqual({ failure: "cleanup_failed", cleanup: "failed" });
    expect(
      imageStorageVerificationFailure({
        primaryFailure: null,
        cleanup: "completed",
        completedChecks: 1,
        expectedChecks: 2,
      }),
    ).toEqual({ failure: "incomplete_roundtrip", cleanup: "completed" });
  });
});
