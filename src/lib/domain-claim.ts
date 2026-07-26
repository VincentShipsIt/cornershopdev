export type DomainClaimTransaction = {
  findOwner: (hostname: string) => Promise<string | null>;
  create: (input: {
    hostname: string;
    siteId: string;
    verificationToken: string;
  }) => Promise<void>;
};

export type DomainClaimStore = {
  runSerializable: <T>(
    operation: (transaction: DomainClaimTransaction) => Promise<T>,
  ) => Promise<T>;
};

const retryableCodes = new Set(["P2002", "P2034"]);

/**
 * Claims an unowned hostname without ever reassigning an existing Domain row.
 * A unique-key or serialization race retries from a fresh snapshot, where the
 * winner's owner is visible and the loser receives a conflict.
 */
export async function claimDomainForSite(
  store: DomainClaimStore,
  input: {
    hostname: string;
    siteId: string;
    verificationToken: string;
  },
): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await store.runSerializable(async (transaction) => {
        const owner = await transaction.findOwner(input.hostname);
        if (owner) return owner === input.siteId;
        await transaction.create(input);
        return true;
      });
    } catch (error) {
      if (attempt < 2 && isRetryableClaimError(error)) continue;
      throw error;
    }
  }
  return false;
}

function isRetryableClaimError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    retryableCodes.has(error.code)
  );
}
