-- Immutable, provenance-bearing photo originals and reviewable enhancement runs.
CREATE TYPE "PhotoSourceKind" AS ENUM ('FIRST_PARTY', 'OWNER_REFERENCE', 'OWNER_UPLOAD');
CREATE TYPE "PhotoReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "PhotoUsage" AS ENUM ('HERO', 'GALLERY', 'CATALOG');
CREATE TYPE "PhotoActiveVariant" AS ENUM ('ORIGINAL', 'ENHANCED');
CREATE TYPE "PhotoEnhancementStatus" AS ENUM ('NOT_REQUESTED', 'QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

CREATE TABLE "PhotoAsset" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "sourcePageUrl" TEXT,
  "provenance" "ImageProvenance" NOT NULL,
  "sourceKind" "PhotoSourceKind" NOT NULL,
  "contentSha256" TEXT NOT NULL,
  "originalStorageKey" TEXT NOT NULL,
  "originalUrl" TEXT NOT NULL,
  "mediaType" TEXT NOT NULL,
  "byteLength" INTEGER NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "candidateUsages" "PhotoUsage"[] NOT NULL,
  "reviewStatus" "PhotoReviewStatus" NOT NULL DEFAULT 'PENDING',
  "selectedUsage" "PhotoUsage",
  "selectedCatalogItemId" TEXT,
  "activeVariant" "PhotoActiveVariant" NOT NULL DEFAULT 'ORIGINAL',
  "enhancedUrl" TEXT,
  "enhancedStorageKey" TEXT,
  "enhancedReviewStatus" "PhotoReviewStatus",
  "enhancementStatus" "PhotoEnhancementStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  "enhancementModel" TEXT,
  "enhancementConfigVersion" TEXT,
  "enhancementCostMicros" INTEGER,
  "reviewedAt" TIMESTAMP(3),
  "reviewedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PhotoAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PhotoEnhancementRun" (
  "id" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "photoId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" "PhotoEnhancementStatus" NOT NULL DEFAULT 'QUEUED',
  "model" TEXT NOT NULL,
  "configVersion" TEXT NOT NULL,
  "estimatedCostMicros" INTEGER NOT NULL,
  "actualCostMicros" INTEGER,
  "requestedBy" TEXT NOT NULL,
  "errorCode" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PhotoEnhancementRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PhotoAsset_siteId_contentSha256_key" ON "PhotoAsset"("siteId", "contentSha256");
CREATE INDEX "PhotoAsset_siteId_reviewStatus_createdAt_idx" ON "PhotoAsset"("siteId", "reviewStatus", "createdAt");
CREATE INDEX "PhotoAsset_siteId_selectedUsage_idx" ON "PhotoAsset"("siteId", "selectedUsage");
CREATE UNIQUE INDEX "PhotoAsset_selectedCatalogItemId_key" ON "PhotoAsset"("selectedCatalogItemId");
CREATE UNIQUE INDEX "PhotoEnhancementRun_idempotencyKey_key" ON "PhotoEnhancementRun"("idempotencyKey");
CREATE INDEX "PhotoEnhancementRun_siteId_status_createdAt_idx" ON "PhotoEnhancementRun"("siteId", "status", "createdAt");
CREATE INDEX "PhotoEnhancementRun_photoId_createdAt_idx" ON "PhotoEnhancementRun"("photoId", "createdAt");
ALTER TABLE "PhotoAsset" ADD CONSTRAINT "PhotoAsset_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PhotoAsset" ADD CONSTRAINT "PhotoAsset_selectedCatalogItemId_fkey" FOREIGN KEY ("selectedCatalogItemId") REFERENCES "CatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PhotoEnhancementRun" ADD CONSTRAINT "PhotoEnhancementRun_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PhotoEnhancementRun" ADD CONSTRAINT "PhotoEnhancementRun_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "PhotoAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
