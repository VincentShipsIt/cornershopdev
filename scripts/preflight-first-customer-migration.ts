import { getDb } from "@/lib/db";
import { isStripeLiveApiKey } from "@/lib/billing-plans";
import { fingerprintFirstCustomerIdentifier } from "@/lib/first-customer-evidence";
import { getStripe } from "@/lib/stripe";

type LegacyInvitation = {
  id: string;
  siteId: string;
  checkoutSessionId: string;
};

type Mode = "check" | "revoke-expired";

let databaseOpened = false;

try {
  const mode = parseArguments(process.argv.slice(2));
  assertProductionConfiguration();
  const db = getDb();
  databaseOpened = true;
  // Raw SQL intentionally uses only columns present before the guarded
  // migration, so the released image can preflight its predecessor schema.
  const invitations = await db.$queryRaw<LegacyInvitation[]>`
    SELECT "id", "siteId", "checkoutSessionId"
    FROM "ClaimInvitation"
    WHERE "proofMethod" = 'OPERATOR_APPROVAL'
      AND "acceptedAt" IS NULL
      AND "revokedAt" IS NULL
      AND "checkoutSessionId" IS NOT NULL
    ORDER BY "createdAt" ASC
  `;
  const observed = await Promise.all(
    invitations.map(async (invitation) => {
      const checkout = await getStripe().checkout.sessions.retrieve(
        invitation.checkoutSessionId,
      );
      if (!checkout.livemode) throw new Error("non_live_checkout_in_production");
      return { invitation, status: checkout.status };
    }),
  );

  if (mode === "revoke-expired") {
    if (observed.some(({ status }) => status !== "expired")) {
      throw new Error("all_checkout_sessions_must_be_expired");
    }
    await db.$transaction(async (tx) => {
      for (const { invitation } of observed) {
        const updated = await tx.$executeRaw`
          UPDATE "ClaimInvitation"
          SET "revokedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${invitation.id}
            AND "siteId" = ${invitation.siteId}
            AND "proofMethod" = 'OPERATOR_APPROVAL'
            AND "acceptedAt" IS NULL
            AND "revokedAt" IS NULL
            AND "checkoutSessionId" = ${invitation.checkoutSessionId}
        `;
        if (updated !== 1) throw new Error("legacy_invitation_changed");
        await tx.auditEvent.create({
          data: {
            type: "claim.invitation.revoked",
            actor: "operator:first-customer-migration",
            siteId: invitation.siteId,
            metadata: {
              invitationId: invitation.id,
              reason: "legacy_operator_approval_without_evidence",
              checkoutSessionStatus: "expired",
            },
          },
        });
      }
    });
  }

  const ready = mode === "revoke-expired" || observed.length === 0;
  console.log(
    JSON.stringify(
      {
        check: "first-customer-migration",
        mode,
        ready,
        legacyInvitationCount: observed.length,
        invitations: observed.map(({ invitation, status }) => ({
          invitationFingerprint: fingerprintFirstCustomerIdentifier(
            invitation.id,
          ),
          checkoutFingerprint: fingerprintFirstCustomerIdentifier(
            invitation.checkoutSessionId,
          ),
          checkoutStatus: status,
        })),
        checkedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  if (!ready) process.exitCode = 1;
} catch {
  console.error(
    JSON.stringify({
      check: "first-customer-migration",
      ready: false,
      failure: "configuration_provider_or_concurrency_failure",
      failedAt: new Date().toISOString(),
    }),
  );
  process.exitCode = 1;
} finally {
  if (databaseOpened) await getDb().$disconnect().catch(() => undefined);
}

function parseArguments(args: string[]): Mode {
  let environment: string | undefined;
  let mode: string | undefined;
  let execute = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--environment") {
      environment = args[index + 1];
      index += 1;
    } else if (args[index] === "--mode") {
      mode = args[index + 1];
      index += 1;
    } else if (args[index] === "--execute") {
      execute = true;
    } else {
      throw new Error("invalid_arguments");
    }
  }
  if (environment !== "production" || !execute) {
    throw new Error("production_confirmation_required");
  }
  if (mode !== "check" && mode !== "revoke-expired") {
    throw new Error("mode_required");
  }
  return mode;
}

function assertProductionConfiguration() {
  const databaseUrl = process.env.DATABASE_URL;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!databaseUrl || !isStripeLiveApiKey(stripeKey)) {
    throw new Error("live_configuration_required");
  }
  const database = new URL(databaseUrl);
  if (
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    ["localhost", "127.0.0.1", "::1"].includes(database.hostname)
  ) {
    throw new Error("production_database_required");
  }
}
