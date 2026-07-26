-- AlterTable
ALTER TABLE "ClaimInvitation"
ADD COLUMN "stripeCheckoutSessionId" TEXT,
ADD COLUMN "stripePriceId" TEXT;

-- AlterTable
ALTER TABLE "Subscription"
ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "lastStripeEventAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "StripeWebhookEvent" (
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "stripeCreatedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("eventId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClaimInvitation_stripeCheckoutSessionId_key"
ON "ClaimInvitation"("stripeCheckoutSessionId");
