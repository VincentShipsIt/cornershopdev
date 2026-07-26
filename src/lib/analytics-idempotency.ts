export type AnalyticsCreateResult = "created" | "duplicate";

export async function createIdempotentAnalyticsEvent(
  create: () => Promise<unknown>,
): Promise<AnalyticsCreateResult> {
  try {
    await create();
    return "created";
  } catch (error) {
    if (hasPrismaCode(error, "P2002")) return "duplicate";
    throw error;
  }
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}
