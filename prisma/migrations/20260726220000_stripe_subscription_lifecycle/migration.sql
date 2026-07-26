-- AlterTable
ALTER TABLE "ClaimInvitation"
ADD COLUMN "stripePriceId" TEXT,
ADD COLUMN "checkoutAttempt" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "checkoutReturnTokenHash" TEXT,
ADD COLUMN "checkoutReturnExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Subscription"
ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "lastStripeEventAt" TIMESTAMP(3),
ADD COLUMN "siteId" TEXT;

-- CreateTable
CREATE TABLE "StripeWebhookEvent" (
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "stripeCreatedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSED',
    "failureReason" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_siteId_key"
ON "Subscription"("siteId");

-- AddForeignKey
ALTER TABLE "Subscription"
ADD CONSTRAINT "Subscription_siteId_fkey"
FOREIGN KEY ("siteId") REFERENCES "Site"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
