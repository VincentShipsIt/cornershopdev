BEGIN;

CREATE TYPE "ClaimDeliveryStatus" AS ENUM (
  'PENDING',
  'SENT',
  'DELIVERED',
  'BOUNCED',
  'SUPPRESSED',
  'FAILED'
);

ALTER TABLE "ClaimInvitation"
ADD COLUMN "deliveryStatus" "ClaimDeliveryStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "providerMessageId" TEXT,
ADD COLUMN "providerEventAt" TIMESTAMP(3),
ADD COLUMN "deliveryFailureCode" TEXT,
ADD COLUMN "deliveredAt" TIMESTAMP(3),
ADD COLUMN "lastDeliveryAttemptAt" TIMESTAMP(3),
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "ClaimProviderEvent" (
  "id" TEXT NOT NULL,
  "claimInvitationId" TEXT NOT NULL,
  "providerMessageId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "deliveryStatus" "ClaimDeliveryStatus" NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ClaimProviderEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClaimInvitation_providerMessageId_key"
ON "ClaimInvitation"("providerMessageId");

CREATE INDEX "ClaimInvitation_deliveryStatus_createdAt_idx"
ON "ClaimInvitation"("deliveryStatus", "createdAt");

CREATE INDEX "ClaimProviderEvent_claimInvitationId_occurredAt_idx"
ON "ClaimProviderEvent"("claimInvitationId", "occurredAt");

CREATE INDEX "ClaimProviderEvent_providerMessageId_occurredAt_idx"
ON "ClaimProviderEvent"("providerMessageId", "occurredAt");

ALTER TABLE "ClaimProviderEvent"
ADD CONSTRAINT "ClaimProviderEvent_claimInvitationId_fkey"
FOREIGN KEY ("claimInvitationId") REFERENCES "ClaimInvitation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
