-- Platform access is separate from organization membership. The environment
-- allowlist remains a second, independent gate in application code.
CREATE TYPE "PlatformRole" AS ENUM ('USER', 'SUPERADMIN');

ALTER TABLE "User"
ADD COLUMN "platformRole" "PlatformRole" NOT NULL DEFAULT 'USER';

-- Preserve approved source copy instead of regenerating it on every read.
ALTER TABLE "Site"
ADD COLUMN "eyebrow" TEXT;

-- Translation labels are index-aligned with integrations. Persist that order
-- explicitly instead of relying on equal createdAt timestamps.
ALTER TABLE "Integration"
ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

WITH ranked_integrations AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "siteId"
      ORDER BY "createdAt" ASC, "id" ASC
    ) - 1 AS position
  FROM "Integration"
)
UPDATE "Integration" AS integration
SET "position" = ranked_integrations.position
FROM ranked_integrations
WHERE integration."id" = ranked_integrations."id";

CREATE INDEX "Integration_siteId_position_idx"
ON "Integration"("siteId", "position");
