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
  return claimDomainSetForSite(store, [input]);
}

/**
 * Claims an apex/www set atomically. Ownership of every hostname is checked
 * before the first insert, so a companion already owned by another site cannot
 * leave half of a canonical pair attached.
 */
export async function claimDomainSetForSite(
  store: DomainClaimStore,
  inputs: Array<{
    hostname: string;
    siteId: string;
    verificationToken: string;
  }>,
): Promise<boolean> {
  if (!inputs.length) return false;
  const siteId = inputs[0].siteId;
  if (inputs.some((input) => input.siteId !== siteId)) {
    throw new Error("A domain set must belong to one site");
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await store.runSerializable(async (transaction) => {
        const owners = await Promise.all(
          inputs.map(async (input) => ({
            input,
            owner: await transaction.findOwner(input.hostname),
          })),
        );
        if (owners.some(({ owner }) => owner && owner !== siteId)) return false;
        for (const { input, owner } of owners) {
          if (!owner) await transaction.create(input);
        }
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
