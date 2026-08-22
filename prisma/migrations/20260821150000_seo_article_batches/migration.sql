-- SEO content engine (#97): per-site article batches.
CREATE TYPE "ArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "batchId" TEXT,
    "slug" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "status" "ArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "publishedBy" TEXT,
    "topicKey" TEXT NOT NULL,
    "topicTitle" TEXT NOT NULL,
    "generatedByModel" TEXT,
    "sourceBatchId" TEXT,
    "unpublishReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleBatch" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "requestedCount" INTEGER NOT NULL,
    "producedCount" INTEGER NOT NULL,
    "model" TEXT,
    "requestedBy" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Article_siteId_status_publishedAt_idx" ON "Article"("siteId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "Article_siteId_topicKey_createdAt_idx" ON "Article"("siteId", "topicKey", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Article_siteId_slug_key" ON "Article"("siteId", "slug");

-- CreateIndex
CREATE INDEX "ArticleBatch_siteId_createdAt_idx" ON "ArticleBatch"("siteId", "createdAt");

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ArticleBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleBatch" ADD CONSTRAINT "ArticleBatch_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
