export type ImageStorageCleanupStatus =
  | "not-required"
  | "completed"
  | "failed";

export type ImageStorageVerificationFailure = {
  failure: string;
  cleanup: ImageStorageCleanupStatus;
};

export function imageStorageVerificationFailure(input: {
  primaryFailure: string | null;
  cleanup: ImageStorageCleanupStatus;
  completedChecks: number;
  expectedChecks: number;
}): ImageStorageVerificationFailure | null {
  const failure =
    input.primaryFailure ??
    (input.cleanup === "failed"
      ? "cleanup_failed"
      : input.completedChecks !== input.expectedChecks
        ? "incomplete_roundtrip"
        : null);
  return failure ? { failure, cleanup: input.cleanup } : null;
}
