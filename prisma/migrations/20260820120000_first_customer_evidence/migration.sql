BEGIN;

ALTER TABLE "StripeWebhookEvent"
ADD COLUMN "livemode" BOOLEAN;

ALTER TABLE "ClaimInvitation"
ADD COLUMN "approvalEvidenceRef" TEXT,
ADD COLUMN "approvedBy" TEXT,
ADD COLUMN "approvedAt" TIMESTAMP(3);

-- Legacy operator approvals did not record the authority evidence required by
-- the new checkout contract. Never invent that proof. An already-bound Stripe
-- Checkout must first be expired by the operator path so a migration cannot
-- leave a chargeable session pointing at a revoked invitation.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ClaimInvitation"
    WHERE "proofMethod" = 'OPERATOR_APPROVAL'
      AND "acceptedAt" IS NULL
      AND "revokedAt" IS NULL
      AND "checkoutSessionId" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Active legacy operator-approved Checkout Sessions must be expired before this migration';
  END IF;
END $$;

UPDATE "ClaimInvitation"
SET "revokedAt" = CURRENT_TIMESTAMP
WHERE "proofMethod" = 'OPERATOR_APPROVAL'
  AND "acceptedAt" IS NULL
  AND "revokedAt" IS NULL
  AND "checkoutSessionId" IS NULL;

COMMIT;
