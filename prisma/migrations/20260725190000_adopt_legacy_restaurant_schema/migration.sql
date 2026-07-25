-- Adopts a database still on the pre-multi-vertical restaurant schema (everything up to
-- `20260723221500_persist_import_identity`) without dropping a row.
--
-- Databases created by `20260724200000_init` are already in the target shape, so the whole
-- body is skipped when the legacy `Restaurant` table is absent. That makes this migration a
-- no-op on fresh databases and on any database that has already been adopted.
--
-- The legacy database is baselined with `prisma migrate resolve --applied` for
-- `20260724200000_init`, `20260724210000_integration_venue_id` and
-- `20260725000000_beauty_vertical` before `migrate deploy` runs, so this file also has to
-- carry what those three would have created: the `Vertical` enum with both values,
-- `Integration.venueId`, and `ImportJob.vertical`.
DO $$
DECLARE
  constraint_rename RECORD;
BEGIN
  IF to_regclass('public."Restaurant"') IS NULL THEN
    RETURN;
  END IF;

  -- Enums. `RestaurantStatus` and `SiteStatus` carry identical values, so a rename keeps
  -- every existing column binding intact.
  ALTER TYPE "RestaurantStatus" RENAME TO "SiteStatus";
  CREATE TYPE "Vertical" AS ENUM ('RESTAURANT', 'BEAUTY');
  CREATE TYPE "BookingRequestStatus" AS ENUM ('NEW', 'NOTIFIED', 'CONTACTED', 'CLOSED');

  -- Tables. Postgres leaves constraint and index names untouched by a table rename, so each
  -- one is renamed explicitly to match what `20260724200000_init` would have produced.
  ALTER TABLE "Restaurant" RENAME TO "Site";
  ALTER TABLE "MenuSection" RENAME TO "CatalogSection";
  ALTER TABLE "MenuItem" RENAME TO "CatalogItem";

  ALTER TABLE "Site" RENAME CONSTRAINT "Restaurant_pkey" TO "Site_pkey";
  ALTER TABLE "Site" RENAME CONSTRAINT "Restaurant_organizationId_fkey" TO "Site_organizationId_fkey";
  ALTER INDEX "Restaurant_slug_key" RENAME TO "Site_slug_key";
  ALTER INDEX "Restaurant_sourceKey_key" RENAME TO "Site_sourceKey_key";

  ALTER TABLE "CatalogSection" RENAME CONSTRAINT "MenuSection_pkey" TO "CatalogSection_pkey";
  ALTER TABLE "CatalogItem" RENAME CONSTRAINT "MenuItem_pkey" TO "CatalogItem_pkey";
  ALTER TABLE "CatalogItem" RENAME CONSTRAINT "MenuItem_sectionId_fkey" TO "CatalogItem_sectionId_fkey";

  -- Foreign keys onto the renamed owner table.
  ALTER TABLE "CatalogSection" RENAME COLUMN "restaurantId" TO "siteId";
  ALTER TABLE "CatalogSection" RENAME CONSTRAINT "MenuSection_restaurantId_fkey" TO "CatalogSection_siteId_fkey";

  ALTER TABLE "Integration" RENAME COLUMN "restaurantId" TO "siteId";
  ALTER TABLE "Integration" RENAME CONSTRAINT "Integration_restaurantId_fkey" TO "Integration_siteId_fkey";

  ALTER TABLE "ImportJob" RENAME COLUMN "restaurantId" TO "siteId";
  ALTER TABLE "ImportJob" RENAME CONSTRAINT "ImportJob_restaurantId_fkey" TO "ImportJob_siteId_fkey";

  ALTER TABLE "SiteVersion" RENAME COLUMN "restaurantId" TO "siteId";
  ALTER TABLE "SiteVersion" RENAME CONSTRAINT "SiteVersion_restaurantId_fkey" TO "SiteVersion_siteId_fkey";
  ALTER INDEX "SiteVersion_restaurantId_version_key" RENAME TO "SiteVersion_siteId_version_key";

  ALTER TABLE "Domain" RENAME COLUMN "restaurantId" TO "siteId";
  ALTER TABLE "Domain" RENAME CONSTRAINT "Domain_restaurantId_fkey" TO "Domain_siteId_fkey";

  ALTER TABLE "ClaimInvitation" RENAME COLUMN "restaurantId" TO "siteId";
  ALTER TABLE "ClaimInvitation" RENAME CONSTRAINT "ClaimInvitation_restaurantId_fkey" TO "ClaimInvitation_siteId_fkey";
  ALTER INDEX "ClaimInvitation_restaurantId_email_idx" RENAME TO "ClaimInvitation_siteId_email_idx";

  ALTER TABLE "AuditEvent" RENAME COLUMN "restaurantId" TO "siteId";
  ALTER TABLE "AuditEvent" RENAME CONSTRAINT "AuditEvent_restaurantId_fkey" TO "AuditEvent_siteId_fkey";
  ALTER INDEX "AuditEvent_restaurantId_createdAt_idx" RENAME TO "AuditEvent_siteId_createdAt_idx";

  -- New columns. Every legacy row is a restaurant, so the enum defaults are already correct.
  ALTER TABLE "Site" ADD COLUMN "vertical" "Vertical" NOT NULL DEFAULT 'RESTAURANT';
  ALTER TABLE "Site" ADD COLUMN "attributes" JSONB NOT NULL DEFAULT '{}';
  ALTER TABLE "CatalogItem" ADD COLUMN "attributes" JSONB NOT NULL DEFAULT '{}';
  ALTER TABLE "Integration" ADD COLUMN "venueId" TEXT;
  ALTER TABLE "ImportJob" ADD COLUMN "vertical" "Vertical" NOT NULL DEFAULT 'RESTAURANT';

  -- Fold the food-only columns into the restaurant vertical's attribute bags. The shapes
  -- mirror `restaurantAttributesSchema` and `restaurantItemAttributesSchema`, whose defaults
  -- are `cuisine: ""` and `dietaryLabels: []`.
  UPDATE "Site"
  SET "attributes" = jsonb_build_object(
    'cuisine', to_jsonb(COALESCE("cuisine", '')),
    'showMenuImages', to_jsonb("showMenuImages")
  );
  ALTER TABLE "Site" DROP COLUMN "cuisine";
  ALTER TABLE "Site" DROP COLUMN "showMenuImages";

  UPDATE "CatalogItem"
  SET "attributes" = jsonb_build_object(
    'dietaryLabels', to_jsonb(COALESCE("dietaryLabels", ARRAY[]::TEXT[]))
  );
  ALTER TABLE "CatalogItem" DROP COLUMN "dietaryLabels";

  -- Reshape the translation overlays. Renaming the tables is not enough: the JSONB payload
  -- itself moved from the flat restaurant shape to the generic site shape, and
  -- `findSiteDraft` hands this column straight to the vertical's Zod draft schema.
  --   {locale, cuisine, eyebrow, description, menuSections:[{name, description,
  --      items:[{name, description, dietaryLabels}]}], integrationLabels}
  -- becomes
  --   {locale, eyebrow, description, attributes:{cuisine}, catalogSections:[{name,
  --      description, items:[{name, description, attributes:{dietaryLabels}}]}],
  --    integrationLabels}
  UPDATE "Site"
  SET "translations" = COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'locale', translation -> 'locale',
        'eyebrow', translation -> 'eyebrow',
        'description', translation -> 'description',
        'attributes', jsonb_build_object(
          'cuisine', COALESCE(translation -> 'cuisine', '""'::jsonb)
        ),
        'catalogSections', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'name', section -> 'name',
              'description', section -> 'description',
              'items', COALESCE((
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'name', item -> 'name',
                    'description', item -> 'description',
                    'attributes', jsonb_build_object(
                      'dietaryLabels', COALESCE(item -> 'dietaryLabels', '[]'::jsonb)
                    )
                  )
                  ORDER BY item_position
                )
                FROM jsonb_array_elements(
                  COALESCE(section -> 'items', '[]'::jsonb)
                ) WITH ORDINALITY AS item_rows(item, item_position)
              ), '[]'::jsonb)
            )
            ORDER BY section_position
          )
          FROM jsonb_array_elements(
            COALESCE(translation -> 'menuSections', '[]'::jsonb)
          ) WITH ORDINALITY AS section_rows(section, section_position)
        ), '[]'::jsonb),
        'integrationLabels', COALESCE(translation -> 'integrationLabels', '[]'::jsonb)
      )
      ORDER BY translation_position
    )
    FROM jsonb_array_elements("translations") WITH ORDINALITY AS translation_rows(translation, translation_position)
  ), '[]'::jsonb)
  WHERE jsonb_typeof("translations") = 'array'
    AND jsonb_array_length("translations") > 0;

  -- Lead capture for sites with no booking provider of their own.
  CREATE TABLE "BookingRequest" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "requestedAt" TIMESTAMP(3),
    "partySize" INTEGER,
    "notes" TEXT,
    "status" "BookingRequestStatus" NOT NULL DEFAULT 'NEW',
    "notifiedAt" TIMESTAMP(3),
    "contactedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingRequest_pkey" PRIMARY KEY ("id")
  );

  CREATE INDEX "BookingRequest_siteId_status_createdAt_idx" ON "BookingRequest"("siteId", "status", "createdAt");

  ALTER TABLE "BookingRequest" ADD CONSTRAINT "BookingRequest_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

  -- Postgres 18 gives every NOT NULL its own named constraint, and neither a table nor a
  -- column rename touches those names -- an adopted database would keep carrying
  -- `Restaurant_id_not_null` on "Site" forever. Prisma does not model the names, so this is
  -- cosmetic, but normalising them keeps a raw dump of an adopted database identical to a
  -- dump of a fresh one. Driven off the catalog rather than a hardcoded list because the
  -- legacy names depend on how the database reached PG18 (created there vs `pg_upgrade`d),
  -- and a single wrong name in an explicit `RENAME CONSTRAINT` would abort the migration.
  FOR constraint_rename IN
    SELECT c.conrelid::regclass::text AS table_ref,
           c.conname AS current_name,
           t.relname || '_' || a.attname || '_not_null' AS target_name
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE n.nspname = 'public'
      AND c.contype = 'n'
      AND c.conname IS DISTINCT FROM t.relname || '_' || a.attname || '_not_null'
  LOOP
    EXECUTE format(
      'ALTER TABLE %s RENAME CONSTRAINT %I TO %I',
      constraint_rename.table_ref,
      constraint_rename.current_name,
      constraint_rename.target_name
    );
  END LOOP;
END $$;
