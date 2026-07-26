-- Draft state remains editable on Site and its normalized child rows. Published
-- state is selected through one pointer to an immutable SiteVersion snapshot.
ALTER TABLE "Site"
ADD COLUMN "draftTheme" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "draftThemeVersion" TEXT NOT NULL DEFAULT 'legacy-v1',
ADD COLUMN "draftPalette" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "publishedSiteVersionId" TEXT;

ALTER TABLE "SiteVersion"
ADD COLUMN "vertical" "Vertical" NOT NULL DEFAULT 'RESTAURANT',
ADD COLUMN "themeVersion" TEXT NOT NULL DEFAULT 'legacy-v1',
ADD COLUMN "palette" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "translations" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "integrations" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "publishedBy" TEXT,
ADD COLUMN "changeSummary" TEXT;

-- Preserve every historical payload before turning the old `theme` column
-- (which used to contain only the palette) into a pinned theme selection.
UPDATE "SiteVersion" AS version
SET
  "vertical" = site."vertical",
  "palette" = CASE
    WHEN jsonb_typeof(version."content" -> 'palette') = 'object'
      THEN version."content" -> 'palette'
    WHEN jsonb_typeof(version."theme") = 'object'
      AND version."theme" ? 'background'
      AND version."theme" ? 'foreground'
      AND version."theme" ? 'accent'
      THEN version."theme"
    WHEN site."vertical" = 'BEAUTY'
      THEN '{"background":"#f7f4f1","foreground":"#211d1b","accent":"#9a6f52"}'::jsonb
    ELSE '{"background":"#f4efe5","foreground":"#1d241f","accent":"#a5482d"}'::jsonb
  END,
  "translations" = CASE
    WHEN jsonb_typeof(version."content" -> 'translations') = 'array'
      THEN version."content" -> 'translations'
    ELSE site."translations"
  END,
  "integrations" = CASE
    WHEN jsonb_typeof(version."content" -> 'integrations') = 'array'
      THEN version."content" -> 'integrations'
    ELSE '[]'::jsonb
  END,
  "themeVersion" = 'legacy-v1',
  "theme" = jsonb_build_object(
    'id',
    CASE
      WHEN site."vertical" = 'BEAUTY' THEN
        COALESCE(version."content" -> 'attributes' ->> 'serviceStyle', 'classic-salon')
      WHEN COALESCE(version."content" -> 'attributes' ->> 'cuisine', '') ~*
        'french|française|gastronom|bistro|brasserie|tradition'
        THEN 'heritage'
      WHEN COALESCE(version."content" -> 'attributes' ->> 'cuisine', '') ~*
        'healthy|vegan|vegetarian|organic|salad|juice|wellness'
        THEN 'fresh'
      WHEN COALESCE(version."content" -> 'attributes' ->> 'cuisine', '') ~*
        'american|burger|barbecue|bbq|steak|diner|tex.?mex|hot dog'
        THEN 'bold'
      WHEN COALESCE(version."content" -> 'attributes' ->> 'cuisine', '') ~*
        'japanese|sushi|ramen|izakaya|korean|omakase'
        THEN 'nocturne'
      WHEN COALESCE(version."content" -> 'attributes' ->> 'cuisine', '') ~*
        'seafood|fish|oyster|coastal|maritime'
        THEN 'coastal'
      ELSE 'warm'
    END
  )
FROM "Site" AS site
WHERE site."id" = version."siteId";

-- Draft palette and theme are now first-class editable state. Use the newest
-- stored payload to preserve the exact pre-migration private preview.
WITH latest_version AS (
  SELECT DISTINCT ON ("siteId")
    "siteId",
    "palette",
    "theme",
    "themeVersion"
  FROM "SiteVersion"
  ORDER BY "siteId", "version" DESC
)
UPDATE "Site" AS site
SET
  "draftPalette" = latest_version."palette",
  "draftTheme" = latest_version."theme",
  "draftThemeVersion" = latest_version."themeVersion"
FROM latest_version
WHERE latest_version."siteId" = site."id";

UPDATE "Site"
SET
  "draftPalette" = CASE
    WHEN "vertical" = 'BEAUTY'
      THEN '{"background":"#f7f4f1","foreground":"#211d1b","accent":"#9a6f52"}'::jsonb
    ELSE '{"background":"#f4efe5","foreground":"#1d241f","accent":"#a5482d"}'::jsonb
  END
WHERE jsonb_typeof("draftPalette") <> 'object'
   OR NOT ("draftPalette" ?& ARRAY['background', 'foreground', 'accent']);

UPDATE "Site"
SET "draftTheme" = jsonb_build_object(
  'id',
  CASE
    WHEN "vertical" = 'BEAUTY'
      THEN COALESCE("attributes" ->> 'serviceStyle', 'classic-salon')
    WHEN COALESCE("attributes" ->> 'cuisine', '') ~*
      'french|française|gastronom|bistro|brasserie|tradition'
      THEN 'heritage'
    WHEN COALESCE("attributes" ->> 'cuisine', '') ~*
      'healthy|vegan|vegetarian|organic|salad|juice|wellness'
      THEN 'fresh'
    WHEN COALESCE("attributes" ->> 'cuisine', '') ~*
      'american|burger|barbecue|bbq|steak|diner|tex.?mex|hot dog'
      THEN 'bold'
    WHEN COALESCE("attributes" ->> 'cuisine', '') ~*
      'japanese|sushi|ramen|izakaya|korean|omakase'
      THEN 'nocturne'
    WHEN COALESCE("attributes" ->> 'cuisine', '') ~*
      'seafood|fish|oyster|coastal|maritime'
      THEN 'coastal'
    ELSE 'warm'
  END
)
WHERE jsonb_typeof("draftTheme") <> 'object'
   OR NOT ("draftTheme" ? 'id');

-- Existing live sites must not disappear during the rollout. Prefer the newest
-- already-valid generic snapshot. Legacy rows are handled by the bootstrap
-- insert below.
WITH latest_valid_snapshot AS (
  SELECT DISTINCT ON (version."siteId")
    version."siteId",
    version."id"
  FROM "SiteVersion" AS version
  WHERE jsonb_typeof(version."content") = 'object'
    AND jsonb_typeof(version."content" -> 'attributes') = 'object'
    AND jsonb_typeof(version."content" -> 'catalogSections') = 'array'
    AND jsonb_typeof(version."content" -> 'integrations') = 'array'
    AND jsonb_typeof(version."content" -> 'palette') = 'object'
  ORDER BY version."siteId", version."version" DESC
)
UPDATE "Site" AS site
SET "publishedSiteVersionId" = snapshot."id"
FROM latest_valid_snapshot AS snapshot
WHERE snapshot."siteId" = site."id"
  AND (
    site."status" = 'LIVE'
    OR EXISTS (
      SELECT 1
      FROM "Domain"
      WHERE "Domain"."siteId" = site."id"
        AND "Domain"."verified" = TRUE
    )
  );

-- A database adopted from the legacy restaurant schema can have only flat
-- SiteVersion payloads. Rebuild one validated generic snapshot from the current
-- normalized draft for any already-public site that still lacks a pointer.
WITH public_sites AS (
  SELECT site.*
  FROM "Site" AS site
  WHERE site."publishedSiteVersionId" IS NULL
    AND (
      site."status" = 'LIVE'
      OR EXISTS (
        SELECT 1
        FROM "Domain"
        WHERE "Domain"."siteId" = site."id"
          AND "Domain"."verified" = TRUE
      )
    )
    AND EXISTS (
      SELECT 1 FROM "CatalogSection"
      WHERE "CatalogSection"."siteId" = site."id"
    )
),
next_versions AS (
  SELECT
    site."id" AS "siteId",
    COALESCE(MAX(version."version"), 0) + 1 AS "version"
  FROM public_sites AS site
  LEFT JOIN "SiteVersion" AS version ON version."siteId" = site."id"
  GROUP BY site."id"
),
bootstrap AS (
  SELECT
    'migration-published-' || md5(site."id") AS "id",
    next_versions."version",
    site."vertical",
    site."draftTheme" AS "theme",
    site."draftThemeVersion" AS "themeVersion",
    site."draftPalette" AS "palette",
    site."translations",
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'type', lower(integration."type"::text),
          'label', integration."label",
          'provider', integration."provider",
          'url', integration."url",
          'venueId', integration."venueId"
        )
        ORDER BY integration."position", integration."createdAt", integration."id"
      )
      FROM "Integration" AS integration
      WHERE integration."siteId" = site."id"
        AND integration."type" <> 'ANALYTICS'
    ), '[]'::jsonb) AS "integrations",
    site."id" AS "siteId",
    jsonb_build_object(
      'slug', site."slug",
      'name', site."name",
      'eyebrow', COALESCE(site."eyebrow", ''),
      'description', COALESCE(
        site."description",
        CASE
          WHEN site."vertical" = 'BEAUTY'
            THEN 'An independent studio taking appointments for cuts, colour and care.'
          ELSE 'An independent restaurant serving its neighbourhood.'
        END
      ),
      'address', COALESCE(site."address", ''),
      'phone', COALESCE(site."phone", ''),
      'sourceUrl', site."sourceUrl",
      'heroImageUrl', site."heroImageUrl",
      'heroOriginalImageUrl', site."heroOriginalImageUrl",
      'heroImageProvenance', CASE
        WHEN site."heroImageProvenance" IS NULL THEN NULL
        ELSE replace(lower(site."heroImageProvenance"::text), '_', '-')
      END,
      'palette', site."draftPalette",
      'attributes', site."attributes",
      'autoEnhanceImages', site."autoEnhanceImages",
      'defaultLocale', site."defaultLocale",
      'translations', site."translations",
      'catalogSections', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'name', section."name",
            'description', COALESCE(section."description", ''),
            'items', COALESCE((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'name', item."name",
                  'description', COALESCE(item."description", ''),
                  'price', item."price",
                  'currency', item."currency",
                  'attributes', item."attributes",
                  'imageUrl', item."imageUrl",
                  'originalImageUrl', item."originalImageUrl",
                  'imageProvenance', CASE
                    WHEN item."imageProvenance" IS NULL THEN NULL
                    ELSE replace(lower(item."imageProvenance"::text), '_', '-')
                  END
                )
                ORDER BY item."position", item."id"
              )
              FROM "CatalogItem" AS item
              WHERE item."sectionId" = section."id"
            ), '[]'::jsonb)
          )
          ORDER BY section."position", section."id"
        )
        FROM "CatalogSection" AS section
        WHERE section."siteId" = site."id"
      ), '[]'::jsonb),
      'integrations', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'type', lower(integration."type"::text),
            'label', integration."label",
            'provider', integration."provider",
            'url', integration."url",
            'venueId', integration."venueId"
          )
          ORDER BY integration."position", integration."createdAt", integration."id"
        )
        FROM "Integration" AS integration
        WHERE integration."siteId" = site."id"
          AND integration."type" <> 'ANALYTICS'
      ), '[]'::jsonb)
    ) AS "content"
  FROM public_sites AS site
  JOIN next_versions ON next_versions."siteId" = site."id"
)
INSERT INTO "SiteVersion" (
  "id",
  "version",
  "vertical",
  "theme",
  "themeVersion",
  "palette",
  "content",
  "translations",
  "integrations",
  "publishedAt",
  "publishedBy",
  "changeSummary",
  "siteId",
  "createdAt"
)
SELECT
  bootstrap."id",
  bootstrap."version",
  bootstrap."vertical",
  bootstrap."theme",
  bootstrap."themeVersion",
  bootstrap."palette",
  bootstrap."content",
  bootstrap."translations",
  bootstrap."integrations",
  CURRENT_TIMESTAMP,
  'system:migration',
  'Existing live site snapshot',
  bootstrap."siteId",
  CURRENT_TIMESTAMP
FROM bootstrap;

UPDATE "Site" AS site
SET "publishedSiteVersionId" = version."id"
FROM "SiteVersion" AS version
WHERE version."siteId" = site."id"
  AND version."id" = 'migration-published-' || md5(site."id")
  AND site."publishedSiteVersionId" IS NULL;

UPDATE "SiteVersion" AS version
SET
  "publishedAt" = COALESCE(version."publishedAt", version."createdAt"),
  "publishedBy" = COALESCE(version."publishedBy", 'system:migration'),
  "changeSummary" = COALESCE(
    version."changeSummary",
    'Existing live site snapshot'
  )
FROM "Site" AS site
WHERE site."publishedSiteVersionId" = version."id";

INSERT INTO "AuditEvent" (
  "id",
  "type",
  "actor",
  "metadata",
  "siteId",
  "createdAt"
)
SELECT
  'migration-publish-audit-' || md5(site."id"),
  'site.published',
  version."publishedBy",
  jsonb_build_object(
    'siteVersionId', version."id",
    'version', version."version",
    'changeSummary', version."changeSummary",
    'themeId', version."theme" ->> 'id',
    'themeVersion', version."themeVersion"
  ),
  site."id",
  version."publishedAt"
FROM "Site" AS site
JOIN "SiteVersion" AS version
  ON version."id" = site."publishedSiteVersionId";

CREATE UNIQUE INDEX "Site_publishedSiteVersionId_key"
ON "Site"("publishedSiteVersionId");

ALTER TABLE "Site"
ADD CONSTRAINT "Site_publishedSiteVersionId_fkey"
FOREIGN KEY ("publishedSiteVersionId")
REFERENCES "SiteVersion"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

-- The pointer may only target a published snapshot owned by the same site.
CREATE FUNCTION enforce_site_published_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."publishedSiteVersionId" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM "SiteVersion"
      WHERE "SiteVersion"."id" = NEW."publishedSiteVersionId"
        AND "SiteVersion"."siteId" = NEW."id"
        AND "SiteVersion"."publishedAt" IS NOT NULL
    )
  THEN
    RAISE EXCEPTION
      'publishedSiteVersionId must reference a published version of the same site'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Site_enforce_published_version"
BEFORE INSERT OR UPDATE OF "publishedSiteVersionId"
ON "Site"
FOR EACH ROW
EXECUTE FUNCTION enforce_site_published_version();

-- Published snapshots are append-only. Rollback (#54) must create a new
-- version rather than rewriting or deleting history.
CREATE FUNCTION prevent_published_site_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- A whole-site cascade is an explicit lifecycle deletion, not history
  -- rewriting. During that cascade the parent row is already absent.
  IF OLD."publishedAt" IS NOT NULL
    AND (
      TG_OP <> 'DELETE'
      OR EXISTS (
        SELECT 1 FROM "Site" WHERE "Site"."id" = OLD."siteId"
      )
    )
  THEN
    RAISE EXCEPTION 'Published site versions are immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER "SiteVersion_prevent_published_update"
BEFORE UPDATE ON "SiteVersion"
FOR EACH ROW
EXECUTE FUNCTION prevent_published_site_version_mutation();

CREATE TRIGGER "SiteVersion_prevent_published_delete"
BEFORE DELETE ON "SiteVersion"
FOR EACH ROW
EXECUTE FUNCTION prevent_published_site_version_mutation();
