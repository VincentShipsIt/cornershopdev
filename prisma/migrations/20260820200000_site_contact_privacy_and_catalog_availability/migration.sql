BEGIN;

ALTER TABLE "Site"
ADD COLUMN "leadContactEmail" TEXT;

-- Before deterministic reconstruction, Site.email was the private operator
-- outreach recipient for unclaimed leads. Move those values behind the private
-- boundary and clear the public field. A later source import may repopulate
-- Site.email only from business-owned public evidence.
UPDATE "Site"
SET "leadContactEmail" = "email"
WHERE
  "status" IN ('PROSPECT', 'PREVIEW_READY')
  AND "email" IS NOT NULL;

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
