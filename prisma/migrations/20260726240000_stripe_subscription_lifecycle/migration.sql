BEGIN;

-- AlterTable
ALTER TABLE "ClaimInvitation"
ADD COLUMN IF NOT EXISTS "stripePriceId" TEXT,
ADD COLUMN IF NOT EXISTS "checkoutAttempt" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "checkoutReturnTokenHash" TEXT,
ADD COLUMN IF NOT EXISTS "checkoutReturnExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Subscription"
ADD COLUMN IF NOT EXISTS "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "lastStripeEventAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "siteId" TEXT;

-- Existing subscriptions predate the site-scoped billing invariant. Backfill
-- only mappings that are provably one-to-one: exactly one site and exactly one
-- subscription in the organization. Refuse to continue if any ambiguous row
-- remains so a paying customer is never silently moved to BILLING_REQUIRED.
WITH "singleSiteOrganizations" AS (
    SELECT "organizationId", MIN("id") AS "siteId"
    FROM "Site"
    WHERE "organizationId" IS NOT NULL
    GROUP BY "organizationId"
    HAVING COUNT(*) = 1
),
"singleSubscriptionOrganizations" AS (
    SELECT "organizationId"
    FROM "Subscription"
    GROUP BY "organizationId"
    HAVING COUNT(*) = 1
)
UPDATE "Subscription" AS subscription
SET "siteId" = site."siteId"
FROM "singleSiteOrganizations" AS site
INNER JOIN "singleSubscriptionOrganizations" AS billing
    ON billing."organizationId" = site."organizationId"
WHERE subscription."organizationId" = site."organizationId";

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "Subscription" WHERE "siteId" IS NULL) THEN
        RAISE EXCEPTION
            'Ambiguous legacy Subscription.siteId mapping; resolve it before deploying';
    END IF;
END
$$;

ALTER TABLE "Subscription"
ALTER COLUMN "siteId" SET NOT NULL;

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

-- One Stripe Customer may own multiple independently billed sites. The Stripe
-- Subscription ID and site ID, not the customer, are the write-side identity.
DROP INDEX "Subscription_stripeCustomerId_key";
CREATE INDEX "Subscription_stripeCustomerId_idx"
ON "Subscription"("stripeCustomerId");

-- AddForeignKey
ALTER TABLE "Subscription"
ADD CONSTRAINT "Subscription_siteId_fkey"
FOREIGN KEY ("siteId") REFERENCES "Site"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
