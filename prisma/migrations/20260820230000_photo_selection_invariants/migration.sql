-- Repair any pre-invariant duplicate hero selections deterministically, keeping
-- the most recently updated selection for each site.
WITH "rankedHeroes" AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "siteId"
      ORDER BY "updatedAt" DESC, "id" DESC
    ) AS "selectionRank"
  FROM "PhotoAsset"
  WHERE "selectedUsage" = 'HERO'
)
UPDATE "PhotoAsset"
SET "selectedUsage" = NULL
WHERE "id" IN (
  SELECT "id" FROM "rankedHeroes" WHERE "selectionRank" > 1
);

CREATE UNIQUE INDEX "PhotoAsset_one_selected_hero_per_site"
ON "PhotoAsset"("siteId")
WHERE "selectedUsage" = 'HERO';
