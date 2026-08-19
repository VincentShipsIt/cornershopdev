BEGIN;

ALTER TYPE "OperatorAlertKind" ADD VALUE 'OUTREACH_REPLY';

ALTER TABLE "OutreachMessage"
ADD COLUMN "rfcMessageId" TEXT,
ADD COLUMN "inReplyTo" TEXT,
ADD COLUMN "threadKey" TEXT,
ADD COLUMN "createdByActor" TEXT,
ADD COLUMN "receivedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "OutreachMessage_rfcMessageId_key"
ON "OutreachMessage"("rfcMessageId");

CREATE INDEX "OutreachMessage_threadKey_createdAt_idx"
ON "OutreachMessage"("threadKey", "createdAt");

CREATE INDEX "OutreachMessage_siteId_direction_createdAt_idx"
ON "OutreachMessage"("siteId", "direction", "createdAt");

COMMIT;
