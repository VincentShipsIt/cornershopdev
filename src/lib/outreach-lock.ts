import type { Prisma } from "@/generated/prisma/client";

export class OutreachDeliveryLockUnavailableError extends Error {
  constructor() {
    super("The outreach delivery fence is busy.");
    this.name = "OutreachDeliveryLockUnavailableError";
  }
}

/**
 * Serializes the very low-volume operator outreach delivery boundary with the
 * global pause mutation. The transaction-scoped lock is released on commit,
 * rollback, or process exit, so it cannot leave a permanent application lock.
 */
export async function lockOutreachDelivery(
  transaction: Prisma.TransactionClient,
): Promise<void> {
  try {
    // Bound lock waiting below the provider timeout + transaction budget. A
    // blocking advisory lock lets a duplicate workflow converge after the
    // first sender commits instead of turning a harmless race into UNKNOWN.
    await transaction.$queryRaw`
      SELECT set_config('lock_timeout', '12000', true)
    `;
    // Run the void-returning PostgreSQL lock function as a command. Returning
    // its `void` pseudo-type through `$queryRaw` makes Prisma's PostgreSQL
    // adapter reject an acquired lock while decoding the result row.
    await transaction.$executeRaw`
      DO $outreach_delivery_lock$
      BEGIN
        PERFORM pg_advisory_xact_lock(1381258068, 1);
      END
      $outreach_delivery_lock$
    `;
  } catch {
    throw new OutreachDeliveryLockUnavailableError();
  }
}

/**
 * Site updates take a PostgreSQL row lock too. Holding the same row here makes
 * contact/preview edits linearize either before or after the provider call.
 */
export async function lockOutreachSite(
  transaction: Prisma.TransactionClient,
  siteId: string,
): Promise<void> {
  try {
    await transaction.$queryRaw`
      SELECT "id"
      FROM "Site"
      WHERE "id" = ${siteId}
      FOR UPDATE NOWAIT
    `;
  } catch {
    throw new OutreachDeliveryLockUnavailableError();
  }
}

export async function lockOutreachDispatchById(
  transaction: Prisma.TransactionClient,
  dispatchId: string,
): Promise<void> {
  try {
    await transaction.$queryRaw`
      SELECT "id"
      FROM "OutreachDispatch"
      WHERE "id" = ${dispatchId}
      FOR UPDATE NOWAIT
    `;
  } catch {
    throw new OutreachDeliveryLockUnavailableError();
  }
}

export async function lockOutreachMessageById(
  transaction: Prisma.TransactionClient,
  messageId: string,
): Promise<void> {
  try {
    await transaction.$queryRaw`
      SELECT "id"
      FROM "OutreachMessage"
      WHERE "id" = ${messageId}
      FOR UPDATE NOWAIT
    `;
  } catch {
    throw new OutreachDeliveryLockUnavailableError();
  }
}

export async function lockOutreachMessageByKey(
  transaction: Prisma.TransactionClient,
  idempotencyKey: string,
): Promise<void> {
  try {
    await transaction.$queryRaw`
      SELECT "id"
      FROM "OutreachMessage"
      WHERE "idempotencyKey" = ${idempotencyKey}
      FOR UPDATE NOWAIT
    `;
  } catch {
    throw new OutreachDeliveryLockUnavailableError();
  }
}

export async function lockClaimInvitationById(
  transaction: Prisma.TransactionClient,
  invitationId: string,
): Promise<void> {
  try {
    await transaction.$queryRaw`
      SELECT "id"
      FROM "ClaimInvitation"
      WHERE "id" = ${invitationId}
      FOR UPDATE NOWAIT
    `;
  } catch {
    throw new OutreachDeliveryLockUnavailableError();
  }
}
