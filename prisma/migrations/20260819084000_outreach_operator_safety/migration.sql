BEGIN;

ALTER TABLE "ClaimInvitation"
ADD COLUMN "outreachKey" TEXT;

ALTER TABLE "OutreachMessage"
ADD COLUMN "idempotencyKey" TEXT DEFAULT ('legacy:' || gen_random_uuid()::text),
ADD COLUMN "replyToAddress" TEXT,
ADD COLUMN "providerEventAt" TIMESTAMP(3),
ADD COLUMN "providerAttemptedAt" TIMESTAMP(3),
ADD COLUMN "deliveryLeaseId" TEXT,
ADD COLUMN "deliveryLeaseExpiresAt" TIMESTAMP(3);

UPDATE "OutreachMessage"
SET "idempotencyKey" = 'legacy:' || "id"
WHERE "idempotencyKey" IS NULL;

ALTER TABLE "OutreachMessage"
ALTER COLUMN "idempotencyKey" SET NOT NULL;

CREATE TABLE "OperatorAuditEvent" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OperatorAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OutreachDispatch" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "template" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "reviewedAt" TIMESTAMP(3) NOT NULL,
  "status" "OutreachStatus" NOT NULL DEFAULT 'QUEUED',
  "workflowRunId" TEXT,
  "requestedBy" TEXT NOT NULL,
  "attempt" INTEGER NOT NULL DEFAULT 1,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OutreachDispatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OutreachProviderEvent" (
  "id" TEXT NOT NULL,
  "outreachMessageId" TEXT NOT NULL,
  "providerMessageId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "status" "OutreachStatus" NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OutreachProviderEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClaimInvitation_outreachKey_key"
ON "ClaimInvitation"("outreachKey");

CREATE UNIQUE INDEX "OutreachMessage_idempotencyKey_key"
ON "OutreachMessage"("idempotencyKey");

CREATE INDEX "OperatorAuditEvent_type_createdAt_idx"
ON "OperatorAuditEvent"("type", "createdAt");

CREATE UNIQUE INDEX "OutreachDispatch_idempotencyKey_key"
ON "OutreachDispatch"("idempotencyKey");

CREATE UNIQUE INDEX "OutreachDispatch_workflowRunId_key"
ON "OutreachDispatch"("workflowRunId");

CREATE INDEX "OutreachDispatch_siteId_createdAt_idx"
ON "OutreachDispatch"("siteId", "createdAt");

CREATE INDEX "OutreachProviderEvent_outreachMessageId_occurredAt_idx"
ON "OutreachProviderEvent"("outreachMessageId", "occurredAt");

CREATE INDEX "OutreachProviderEvent_providerMessageId_occurredAt_idx"
ON "OutreachProviderEvent"("providerMessageId", "occurredAt");

ALTER TABLE "OutreachDispatch"
ADD CONSTRAINT "OutreachDispatch_siteId_fkey"
FOREIGN KEY ("siteId") REFERENCES "Site"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OutreachProviderEvent"
ADD CONSTRAINT "OutreachProviderEvent_outreachMessageId_fkey"
FOREIGN KEY ("outreachMessageId") REFERENCES "OutreachMessage"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
