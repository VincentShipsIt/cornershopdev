CREATE TYPE "SourceMonitorRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');
CREATE TYPE "SourceMonitorSuggestionField" AS ENUM ('MENU', 'CONTACT', 'HOURS', 'LINKS');
CREATE TYPE "SourceMonitorSuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

ALTER TABLE "Site"
ADD COLUMN "businessHours" JSONB NOT NULL DEFAULT '[]';

CREATE TABLE "SourceMonitorState" (
  "siteId" TEXT NOT NULL,
  "cadenceDays" INTEGER NOT NULL,
  "nextRunAt" TIMESTAMP(3) NOT NULL,
  "lastRunAt" TIMESTAMP(3),
  "lastSuccessAt" TIMESTAMP(3),
  "lastFailureAt" TIMESTAMP(3),
  "lastFailureCode" TEXT,
  "lastRunId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SourceMonitorState_pkey" PRIMARY KEY ("siteId")
);

CREATE TABLE "SourceMonitorRun" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "status" "SourceMonitorRunStatus" NOT NULL DEFAULT 'QUEUED',
  "workflowRunId" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "checkedSourceCount" INTEGER NOT NULL DEFAULT 0,
  "failedSourceCount" INTEGER NOT NULL DEFAULT 0,
  "suggestionCount" INTEGER NOT NULL DEFAULT 0,
  "notificationSentAt" TIMESTAMP(3),
  "notificationFailureCode" TEXT,
  "siteId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SourceMonitorRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SourceMonitorSuggestion" (
  "id" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "field" "SourceMonitorSuggestionField" NOT NULL,
  "path" TEXT NOT NULL,
  "currentValue" JSONB NOT NULL,
  "suggestedValue" JSONB NOT NULL,
  "editedValue" JSONB,
  "evidence" JSONB NOT NULL,
  "status" "SourceMonitorSuggestionStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNote" TEXT,
  "runId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SourceMonitorSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SourceMonitorRun_idempotencyKey_key" ON "SourceMonitorRun"("idempotencyKey");
CREATE UNIQUE INDEX "SourceMonitorRun_workflowRunId_key" ON "SourceMonitorRun"("workflowRunId");
CREATE INDEX "SourceMonitorRun_siteId_scheduledFor_idx" ON "SourceMonitorRun"("siteId", "scheduledFor");
CREATE INDEX "SourceMonitorRun_status_createdAt_idx" ON "SourceMonitorRun"("status", "createdAt");
CREATE UNIQUE INDEX "SourceMonitorSuggestion_runId_fingerprint_key" ON "SourceMonitorSuggestion"("runId", "fingerprint");
CREATE INDEX "SourceMonitorSuggestion_siteId_status_createdAt_idx" ON "SourceMonitorSuggestion"("siteId", "status", "createdAt");
CREATE INDEX "SourceMonitorState_nextRunAt_idx" ON "SourceMonitorState"("nextRunAt");

ALTER TABLE "SourceMonitorState"
ADD CONSTRAINT "SourceMonitorState_siteId_fkey"
FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SourceMonitorRun"
ADD CONSTRAINT "SourceMonitorRun_siteId_fkey"
FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SourceMonitorSuggestion"
ADD CONSTRAINT "SourceMonitorSuggestion_runId_fkey"
FOREIGN KEY ("runId") REFERENCES "SourceMonitorRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SourceMonitorSuggestion"
ADD CONSTRAINT "SourceMonitorSuggestion_siteId_fkey"
FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
