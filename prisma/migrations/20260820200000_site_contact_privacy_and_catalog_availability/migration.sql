BEGIN;

ALTER TABLE "Site"
ADD COLUMN "leadContactEmail" TEXT;

-- Before deterministic reconstruction, Site.email did not have a public
-- rendering contract. Preserve every privacy-ambiguous legacy value behind the
-- private boundary before clearing the public field; only mutable lead states
-- are eligible for outreach. A later source import may repopulate Site.email
-- only from business-owned public evidence.
UPDATE "Site"
SET "leadContactEmail" = "email"
WHERE
  "email" IS NOT NULL
  AND "leadContactEmail" IS NULL;

-- Site.email had no public renderer before this release, so every preexisting
-- value is privacy-ambiguous. Fail closed for every lifecycle state; sourced
-- business email evidence can repopulate the public column on a later import or
-- owner-reviewed save.
UPDATE "Site"
SET "email" = NULL
WHERE "email" IS NOT NULL;

ALTER TABLE "CatalogItem"
ALTER COLUMN "available" DROP DEFAULT,
ALTER COLUMN "available" DROP NOT NULL;

COMMIT;
