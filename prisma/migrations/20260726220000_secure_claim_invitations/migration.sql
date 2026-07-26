CREATE TYPE "ClaimProofMethod" AS ENUM ('DOMAIN_EMAIL', 'OPERATOR_APPROVAL');

ALTER TABLE "ClaimInvitation"
ADD COLUMN "proofMethod" "ClaimProofMethod" NOT NULL DEFAULT 'DOMAIN_EMAIL',
ADD COLUMN "verifiedAt" TIMESTAMP(3),
ADD COLUMN "revokedAt" TIMESTAMP(3),
ADD COLUMN "checkoutSessionId" TEXT;

DROP INDEX "ClaimInvitation_siteId_email_idx";

CREATE UNIQUE INDEX "ClaimInvitation_checkoutSessionId_key"
ON "ClaimInvitation"("checkoutSessionId");

CREATE UNIQUE INDEX "ClaimInvitation_one_active_per_site_key"
ON "ClaimInvitation"("siteId")
WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;

CREATE INDEX "ClaimInvitation_siteId_email_expiresAt_idx"
ON "ClaimInvitation"("siteId", "email", "expiresAt");
