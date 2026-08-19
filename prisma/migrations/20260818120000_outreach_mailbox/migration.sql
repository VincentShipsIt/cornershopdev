BEGIN;

-- AlterEnum
ALTER TYPE "OperatorAlertKind" ADD VALUE 'OUTREACH_SEND_FAILURE';

CREATE TYPE "OutreachDirection" AS ENUM (
  'OUTBOUND',
  'INBOUND'
);

CREATE TYPE "OutreachStatus" AS ENUM (
  'QUEUED',
  'SENT',
  'DELIVERED',
  'BOUNCED',
  'COMPLAINED',
  'FAILED',
  'RECEIVED'
);

CREATE TABLE "OutreachMessage" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "direction" "OutreachDirection" NOT NULL DEFAULT 'OUTBOUND',
  "provider" TEXT NOT NULL DEFAULT 'resend',
  "providerMessageId" TEXT,
  "fromAddress" TEXT NOT NULL,
  "toAddress" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "textBody" TEXT NOT NULL,
  "htmlBody" TEXT,
  "template" TEXT,
  "status" "OutreachStatus" NOT NULL DEFAULT 'QUEUED',
  "error" TEXT,
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OutreachMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperatorSetting" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OperatorSetting_pkey" PRIMARY KEY ("key")
);

CREATE UNIQUE INDEX "OutreachMessage_providerMessageId_key"
ON "OutreachMessage"("providerMessageId");

CREATE INDEX "OutreachMessage_siteId_createdAt_idx"
ON "OutreachMessage"("siteId", "createdAt");

ALTER TABLE "OutreachMessage" ADD CONSTRAINT "OutreachMessage_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
