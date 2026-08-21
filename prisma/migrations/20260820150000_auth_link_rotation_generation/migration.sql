BEGIN;

ALTER TABLE "User"
ADD COLUMN "authLinkSequence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "authLinkActiveGeneration" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AuthMagicLink"
ADD COLUMN "rotationGeneration" INTEGER;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "userId"
      ORDER BY "createdAt" ASC, "id" ASC
    )::INTEGER AS generation
  FROM "AuthMagicLink"
)
UPDATE "AuthMagicLink" AS link
SET "rotationGeneration" = ranked.generation
FROM ranked
WHERE link."id" = ranked."id";

UPDATE "User" AS account
SET
  "authLinkSequence" = generations.maximum,
  "authLinkActiveGeneration" = generations.active
FROM (
  SELECT
    "userId",
    MAX("rotationGeneration") AS maximum,
    COALESCE(
      MAX("rotationGeneration") FILTER (
        WHERE "consumedAt" IS NULL
          AND "revokedAt" IS NULL
          AND "expiresAt" > CURRENT_TIMESTAMP
          AND "deliveryStatus" IN ('SENT', 'DELIVERED')
      ),
      0
    ) AS active
  FROM "AuthMagicLink"
  GROUP BY "userId"
) AS generations
WHERE account."id" = generations."userId";

-- Only the newest historically usable generation remains a credential. This
-- establishes the same single-active-link invariant before application code
-- starts issuing generation-backed links.
DELETE FROM "Verification" AS verification
USING "AuthMagicLink" AS link, "User" AS account
WHERE verification."identifier" = link."tokenHash"
  AND link."userId" = account."id"
  AND link."consumedAt" IS NULL
  AND link."revokedAt" IS NULL
  AND (
    link."rotationGeneration" < account."authLinkActiveGeneration"
    OR link."deliveryStatus" IN ('FAILED', 'BOUNCED', 'SUPPRESSED')
  );

UPDATE "AuthMagicLink" AS link
SET "revokedAt" = CURRENT_TIMESTAMP
FROM "User" AS account
WHERE link."userId" = account."id"
  AND link."consumedAt" IS NULL
  AND link."revokedAt" IS NULL
  AND (
    link."rotationGeneration" < account."authLinkActiveGeneration"
    OR link."deliveryStatus" IN ('FAILED', 'BOUNCED', 'SUPPRESSED')
  );

ALTER TABLE "AuthMagicLink"
ALTER COLUMN "rotationGeneration" SET NOT NULL;

CREATE UNIQUE INDEX "AuthMagicLink_userId_rotationGeneration_key"
ON "AuthMagicLink"("userId", "rotationGeneration");

COMMIT;
