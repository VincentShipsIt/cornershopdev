BEGIN;

ALTER TYPE "AuthDeliveryStatus" ADD VALUE 'DELIVERED';
ALTER TYPE "AuthDeliveryStatus" ADD VALUE 'BOUNCED';
ALTER TYPE "AuthDeliveryStatus" ADD VALUE 'SUPPRESSED';

ALTER TABLE "AuthMagicLink"
ADD COLUMN "providerEventAt" TIMESTAMP(3);

-- Earlier `SENT` rows recorded provider API acceptance in `deliveredAt`.
-- Clear that ambiguous timestamp so only signed `email.delivered` webhooks can
-- establish delivery evidence after this migration.
UPDATE "AuthMagicLink"
SET "deliveredAt" = NULL
WHERE "deliveryStatus" = 'SENT';

UPDATE "AuthEvent"
SET "type" = 'auth.magic_link.provider_accepted'
WHERE "type" = 'auth.magic_link.delivered';

CREATE TABLE "AuthProviderEvent" (
    "id" TEXT NOT NULL,
    "authMagicLinkId" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "deliveryStatus" "AuthDeliveryStatus" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthProviderEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuthProviderEvent_authMagicLinkId_occurredAt_idx"
ON "AuthProviderEvent"("authMagicLinkId", "occurredAt");

CREATE INDEX "AuthProviderEvent_providerMessageId_occurredAt_idx"
ON "AuthProviderEvent"("providerMessageId", "occurredAt");

ALTER TABLE "AuthProviderEvent"
ADD CONSTRAINT "AuthProviderEvent_authMagicLinkId_fkey"
FOREIGN KEY ("authMagicLinkId") REFERENCES "AuthMagicLink"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
