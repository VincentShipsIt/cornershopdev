BEGIN;

CREATE TYPE "AuthLinkDestination" AS ENUM ('ADMIN', 'WORKSPACE');
CREATE TYPE "AuthDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');
CREATE TYPE "AuthSessionPurpose" AS ENUM ('ADMIN', 'WORKSPACE_SELECTION', 'SITE');

CREATE TABLE "AuthMagicLink" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "destination" "AuthLinkDestination" NOT NULL,
    "brandVertical" "Vertical",
    "deliveryStatus" "AuthDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "providerMessageId" TEXT,
    "failureCode" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthMagicLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" "AuthSessionPurpose" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "siteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actor" TEXT,
    "subjectUserId" TEXT,
    "magicLinkId" TEXT,
    "sessionId" TEXT,
    "siteId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthMagicLink_tokenHash_key"
ON "AuthMagicLink"("tokenHash");
CREATE INDEX "AuthMagicLink_userId_createdAt_idx"
ON "AuthMagicLink"("userId", "createdAt");
CREATE INDEX "AuthMagicLink_deliveryStatus_createdAt_idx"
ON "AuthMagicLink"("deliveryStatus", "createdAt");

CREATE UNIQUE INDEX "AuthSession_tokenHash_key"
ON "AuthSession"("tokenHash");
CREATE INDEX "AuthSession_userId_expiresAt_idx"
ON "AuthSession"("userId", "expiresAt");
CREATE INDEX "AuthSession_siteId_expiresAt_idx"
ON "AuthSession"("siteId", "expiresAt");

CREATE INDEX "AuthEvent_subjectUserId_createdAt_idx"
ON "AuthEvent"("subjectUserId", "createdAt");
CREATE INDEX "AuthEvent_magicLinkId_createdAt_idx"
ON "AuthEvent"("magicLinkId", "createdAt");
CREATE INDEX "AuthEvent_sessionId_createdAt_idx"
ON "AuthEvent"("sessionId", "createdAt");

ALTER TABLE "AuthMagicLink"
ADD CONSTRAINT "AuthMagicLink_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuthSession"
ADD CONSTRAINT "AuthSession_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuthSession"
ADD CONSTRAINT "AuthSession_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuthSession"
ADD CONSTRAINT "AuthSession_siteId_fkey"
FOREIGN KEY ("siteId") REFERENCES "Site"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
