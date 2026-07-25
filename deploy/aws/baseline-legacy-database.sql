-- One-time baselining for a database still on the pre-multi-vertical restaurant schema.
--
-- `20260724200000_init`, `20260724210000_integration_venue_id` and
-- `20260725000000_beauty_vertical` describe a database built from scratch. A legacy database
-- already holds their end state under the old names, so replaying them would fail on
-- `CREATE TABLE "Site"`. `20260725190000_adopt_legacy_restaurant_schema` is what carries a
-- legacy database forward instead, and it reproduces everything those three would have
-- created. This script marks the three as applied so `prisma migrate deploy` skips straight
-- to the adoption migration -- the same effect as `prisma migrate resolve --applied <name>`,
-- expressed as SQL so it can run inside the already-deployed container, which predates the
-- migration directories the CLI would need to read.
--
-- The checksums are the sha256 of each `migration.sql` and must stay in sync with them; a
-- mismatch makes `migrate deploy` refuse to run. Verify with:
--   shasum -a 256 prisma/migrations/<name>/migration.sql
--
-- Safe to run more than once, and a no-op on any database that is not the legacy shape.
DO $$
DECLARE
  baseline RECORD;
  inserted INTEGER;
BEGIN
  IF to_regclass('public."Restaurant"') IS NULL THEN
    RAISE NOTICE 'No legacy "Restaurant" table -- not a legacy database, nothing to baseline.';
    RETURN;
  END IF;

  IF to_regclass('public."Site"') IS NOT NULL THEN
    RAISE NOTICE 'A "Site" table already exists -- this database has already been adopted.';
    RETURN;
  END IF;

  FOR baseline IN
    SELECT *
    FROM (VALUES
      ('20260724200000_init',
       'cb1c5f2ed6f0c98efcc75a230ec951e34b91566ae86574e8f7894313c3881471'),
      ('20260724210000_integration_venue_id',
       '5926005243d836b055ed798a65355751f581681329adc878acc8ad90b153c463'),
      ('20260725000000_beauty_vertical',
       '297493cc641719cc1b020236d1d7d9b3588c928f87eaeeea8bbc59d8f03deb93')
    ) AS candidates(migration_name, checksum)
  LOOP
    INSERT INTO "_prisma_migrations" (
      id,
      checksum,
      migration_name,
      started_at,
      finished_at,
      applied_steps_count
    )
    SELECT gen_random_uuid()::text, baseline.checksum, baseline.migration_name, now(), now(), 0
    WHERE NOT EXISTS (
      SELECT 1
      FROM "_prisma_migrations" applied
      WHERE applied.migration_name = baseline.migration_name
    );

    GET DIAGNOSTICS inserted = ROW_COUNT;
    IF inserted = 1 THEN
      RAISE NOTICE 'Baselined %.', baseline.migration_name;
    ELSE
      RAISE NOTICE 'Already recorded: %.', baseline.migration_name;
    END IF;
  END LOOP;
END $$;
