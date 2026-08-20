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

-- The predecessor application can remain live while the candidate runs this
-- migration. Hold the ALTER lock until this constraint exists so that an old
-- binary cannot create a new chargeable operator approval without the proof
-- fields it does not know how to write. Accepted legacy and revoked rows remain
-- readable for replay/audit purposes.
ALTER TABLE "ClaimInvitation"
ADD CONSTRAINT "ClaimInvitation_operator_approval_evidence_check"
CHECK (
  "proofMethod" <> 'OPERATOR_APPROVAL'
  OR "acceptedAt" IS NOT NULL
  OR "revokedAt" IS NOT NULL
  OR (
    NULLIF(BTRIM("approvalEvidenceRef"), '') IS NOT NULL
    AND NULLIF(BTRIM("approvedBy"), '') IS NOT NULL
    AND "approvedAt" IS NOT NULL
  )
);

COMMIT;
