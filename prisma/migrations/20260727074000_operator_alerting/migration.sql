BEGIN;

CREATE TYPE "OperatorAlertKind" AS ENUM (
  'CHECKOUT_WEBHOOK_FAILURE',
  'PUBLISH_FAILURE',
  'PUBLIC_SITE_HEALTH_FAILURE'
);

CREATE TYPE "OperatorAlertStatus" AS ENUM (
  'PENDING',
  'DELIVERED',
  'EXHAUSTED'
);

CREATE TABLE "OperatorAlert" (
  "id" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "kind" "OperatorAlertKind" NOT NULL,
  "status" "OperatorAlertStatus" NOT NULL DEFAULT 'PENDING',
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "context" JSONB,
  "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "firstOccurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastOccurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveryLeaseUntil" TIMESTAMP(3),
  "deliveryLeaseToken" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "lastFailureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OperatorAlert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OperatorAlert_fingerprint_key"
ON "OperatorAlert"("fingerprint");

CREATE INDEX "OperatorAlert_status_nextAttemptAt_idx"
ON "OperatorAlert"("status", "nextAttemptAt");

CREATE INDEX "OperatorAlert_kind_lastOccurredAt_idx"
ON "OperatorAlert"("kind", "lastOccurredAt");

COMMIT;
