import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, mock, test } from "bun:test";
import { Client } from "pg";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteRenderer } from "@/components/site-renderer";
import { Vertical } from "@/generated/prisma/enums";
import { deterministicDraft } from "@/lib/ai/site-generation";
import { siteDraftScalarData } from "@/lib/site-persistence";
import type { PublishedSiteVersionRecord } from "@/lib/sites";
import { beautyConfig } from "@/lib/verticals/beauty/config";
import { restaurantConfig } from "@/lib/verticals/restaurant/config";
import { sampleSiteDraft } from "@/lib/verticals/restaurant/schema";

mock.module("server-only", () => ({}));

const enabled = process.env.SITE_CONTACT_MIGRATION_POSTGRES_TEST === "1";
const migrationsDirectory = fileURLToPath(
  new URL("../../prisma/migrations/", import.meta.url),
);
const lastPredecessorMigration =
  "20260820140000_claim_invitation_delivery";
const authRotationMigration =
  "20260820150000_auth_link_rotation_generation";
const reconstructionMigration =
  "20260820170000_deterministic_source_reconstruction";
const privacyMigration =
  "20260820200000_site_contact_privacy_and_catalog_availability";
const foodRetailMigration = "20260820210000_food_retail_vertical";
const localServiceMigration = "20260820220000_local_service_vertical";

describe.skipIf(!enabled)("site-contact predecessor upgrade", () => {
  test(
    "runs the exact migrations while preserving private recipients and compatible public snapshots",
    async () => {
      const sourceDatabaseUrl = process.env.DATABASE_URL;
      if (!sourceDatabaseUrl) throw new Error("DATABASE_URL is required");

      const databaseName = `site_contact_upgrade_${randomUUID().replaceAll("-", "")}`;
      const adminUrl = new URL(sourceDatabaseUrl);
      adminUrl.pathname = "/postgres";
      adminUrl.searchParams.delete("schema");
      const upgradeUrl = new URL(sourceDatabaseUrl);
      upgradeUrl.pathname = `/${databaseName}`;
      upgradeUrl.searchParams.delete("schema");
      const admin = new Client({ connectionString: adminUrl.toString() });
      let upgrade: Client | null = null;

      await admin.connect();
      await admin.query(`CREATE DATABASE "${databaseName}" TEMPLATE template0`);
      try {
        upgrade = new Client({ connectionString: upgradeUrl.toString() });
        await upgrade.connect();

        const migrationNames = (await readdir(migrationsDirectory, {
          withFileTypes: true,
        }))
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
          .sort();
        const predecessorMigrations = migrationNames.filter(
          (name) => name <= lastPredecessorMigration,
        );
        expect(predecessorMigrations.at(-1)).toBe(lastPredecessorMigration);
        for (const migrationName of predecessorMigrations) {
          await applyMigration(upgrade, migrationName);
        }

        const businessEmail = "hello@business.example";
        const privateRecipient = "owner.private@example.test";
        const legacyProspectRecipient = "legacy.prospect@example.test";
        const sourceUrl = "https://business.example/";
        const legacyImageUrl = "http://business.example/legacy-hero.jpg";
        const scalar = siteDraftScalarData(
          sampleSiteDraft,
          restaurantConfig.id,
        );
        const legacySnapshot = {
          ...sampleSiteDraft,
          slug: "migration-business",
          email: businessEmail,
          sourceUrl,
          logoUrl: legacyImageUrl,
          faviconUrl: legacyImageUrl,
          heroImageUrl: legacyImageUrl,
          heroOriginalImageUrl: legacyImageUrl,
          sourceData: {
            navigation: [
              { label: "Menu", url: "https://business.example/menu" },
            ],
            brandAssets: [
              {
                type: "hero",
                url: legacyImageUrl,
                sourceUrl,
                provenance: "official",
                evidence: "meta",
              },
            ],
            evidence: [],
          },
        };
        const predecessorBeauty = predecessorBeautySnapshot();

        await upgrade.query(
          `INSERT INTO "Site" ("id", "slug", "name", "email", "status", "vertical", "updatedAt")
           VALUES
             ('site-business', 'migration-business', 'Migration Business', $1, 'LIVE', 'RESTAURANT', NOW()),
             ('site-prospect', 'migration-prospect', 'Migration Prospect', $2, 'PROSPECT', 'RESTAURANT', NOW()),
             ('site-beauty', 'predecessor-beauty', 'Predecessor Beauty Studio', NULL, 'LIVE', 'BEAUTY', NOW())`,
          [privateRecipient, legacyProspectRecipient],
        );
        await upgrade.query(
          `INSERT INTO "SiteVersion" (
             "id", "version", "vertical", "theme", "themeVersion", "palette",
             "content", "translations", "integrations", "publishedAt", "siteId"
           ) VALUES (
             'version-business', 1, 'RESTAURANT', $1::jsonb, $2, $3::jsonb,
             $4::jsonb, $5::jsonb, $6::jsonb, NOW(), 'site-business'
           )`,
          [
            JSON.stringify(scalar.draftTheme),
            scalar.draftThemeVersion,
            JSON.stringify(sampleSiteDraft.palette),
            JSON.stringify(legacySnapshot),
            JSON.stringify(sampleSiteDraft.translations),
            JSON.stringify(sampleSiteDraft.integrations),
          ],
        );
        await upgrade.query(
          `INSERT INTO "SiteVersion" (
             "id", "version", "vertical", "theme", "themeVersion", "palette",
             "content", "translations", "integrations", "publishedAt", "siteId"
           ) VALUES (
             'version-beauty', 1, 'BEAUTY', $1::jsonb, $2, $3::jsonb,
             $4::jsonb, $5::jsonb, $6::jsonb, NOW(), 'site-beauty'
           )`,
          [
            JSON.stringify(predecessorBeauty.scalar.draftTheme),
            predecessorBeauty.scalar.draftThemeVersion,
            JSON.stringify(predecessorBeauty.draft.palette),
            JSON.stringify(predecessorBeauty.draft),
            JSON.stringify(predecessorBeauty.translations),
            JSON.stringify(predecessorBeauty.integrations),
          ],
        );

        await applyMigration(upgrade, authRotationMigration);
        await applyMigration(upgrade, reconstructionMigration);
        await applyMigration(upgrade, privacyMigration);
        await applyMigration(upgrade, foodRetailMigration);

        const preLocalVerticalValues = await enumValues(upgrade, "Vertical");
        const preLocalIntegrationValues = await enumValues(
          upgrade,
          "IntegrationType",
        );
        expect(preLocalVerticalValues).toContain(Vertical.FOOD_RETAIL);
        expect(preLocalVerticalValues).not.toContain("LOCAL_SERVICE");
        expect(preLocalIntegrationValues).not.toContain("QUOTE");
        expect(preLocalIntegrationValues).not.toContain("CONTACT");

        await applyMigration(upgrade, localServiceMigration);

        const contacts = await upgrade.query<{
          email: string | null;
          leadContactEmail: string | null;
          slug: string;
        }>(
          `SELECT "slug", "email", "leadContactEmail"
           FROM "Site"
           ORDER BY "slug"`,
        );
        expect(contacts.rows).toEqual([
          {
            slug: "migration-business",
            email: null,
            leadContactEmail: privateRecipient,
          },
          {
            slug: "migration-prospect",
            email: null,
            leadContactEmail: legacyProspectRecipient,
          },
          {
            slug: "predecessor-beauty",
            email: null,
            leadContactEmail: null,
          },
        ]);

        const versionResult = await upgrade.query<{
          vertical: Vertical;
          theme: PublishedSiteVersionRecord["theme"];
          themeVersion: string;
          palette: PublishedSiteVersionRecord["palette"];
          content: PublishedSiteVersionRecord["content"];
          translations: PublishedSiteVersionRecord["translations"];
          integrations: PublishedSiteVersionRecord["integrations"];
          publishedAt: Date;
        }>(
          `SELECT "vertical", "theme", "themeVersion", "palette", "content",
                  "translations", "integrations", "publishedAt"
           FROM "SiteVersion"
           WHERE "id" = 'version-business'`,
        );
        const { projectPublishedSiteVersion } = await import("@/lib/sites");
        const loaded = projectPublishedSiteVersion(
          versionResult.rows[0] as PublishedSiteVersionRecord,
        );
        expect(loaded).not.toBeNull();
        const publicJson = JSON.stringify(loaded?.draft);
        const markup = renderToStaticMarkup(
          <SiteRenderer
            draft={loaded!.draft}
            vertical={restaurantConfig.id}
          />,
        );

        expect(publicJson).toContain(businessEmail);
        expect(publicJson).not.toContain(privateRecipient);
        expect(publicJson).not.toContain(legacyImageUrl);
        expect(markup).toContain(`mailto:${businessEmail}`);
        expect(markup).not.toContain(privateRecipient);
        expect(markup).not.toContain(legacyImageUrl);
        expect(loaded?.draft.sourceData?.navigation).toEqual([
          {
            label: "Menu",
            url: "/menu",
            destinationUrl: "https://business.example/menu",
          },
        ]);

        const beautyVersionResult = await upgrade.query<{
          vertical: Vertical;
          theme: PublishedSiteVersionRecord["theme"];
          themeVersion: string;
          palette: PublishedSiteVersionRecord["palette"];
          content: PublishedSiteVersionRecord["content"];
          translations: PublishedSiteVersionRecord["translations"];
          integrations: PublishedSiteVersionRecord["integrations"];
          publishedAt: Date;
        }>(
          `SELECT "vertical", "theme", "themeVersion", "palette", "content",
                  "translations", "integrations", "publishedAt"
           FROM "SiteVersion"
           WHERE "id" = 'version-beauty'`,
        );
        const loadedBeauty = projectPublishedSiteVersion(
          beautyVersionResult.rows[0] as PublishedSiteVersionRecord,
        );
        expect(loadedBeauty?.draft.integrations.map(({ type }) => type)).toEqual(
          ["booking", "social"],
        );
        expect(loadedBeauty?.draft.translations).toEqual([
          expect.objectContaining({
            integrationLabels: ["Réserver", "Instagram"],
          }),
        ]);

        const retainedSecurityTables = await upgrade.query<{ name: string }>(
          `SELECT table_name AS "name"
           FROM information_schema.tables
           WHERE table_schema = 'public'
             AND table_name IN ('AuthProviderEvent', 'ClaimProviderEvent')
           ORDER BY table_name`,
        );
        expect(retainedSecurityTables.rows).toEqual([
          { name: "AuthProviderEvent" },
          { name: "ClaimProviderEvent" },
        ]);

        const verticalValues = await upgrade.query<{ value: string }>(
          `SELECT enumlabel AS value
           FROM pg_enum
           JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
           WHERE pg_type.typname = 'Vertical'
           ORDER BY enumsortorder`,
        );
        expect(verticalValues.rows.map((row) => row.value)).toContain(
          Vertical.FOOD_RETAIL,
        );
        expect(verticalValues.rows.map((row) => row.value)).toContain(
          Vertical.LOCAL_SERVICE,
        );
        expect(verticalValues.rows.map((row) => row.value).slice(-2)).toEqual([
          "LOCAL_SERVICE",
          "FOOD_RETAIL",
        ]);
        const integrationValues = await upgrade.query<{ value: string }>(
          `SELECT enumlabel AS value
           FROM pg_enum
           JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
           WHERE pg_type.typname = 'IntegrationType'
           ORDER BY enumsortorder`,
        );
        expect(integrationValues.rows.map((row) => row.value)).toEqual(
          expect.arrayContaining(["QUOTE", "CONTACT"]),
        );
        expect(integrationValues.rows.map((row) => row.value).slice(-3)).toEqual(
          ["QUOTE", "CONTACT", "ANALYTICS"],
        );
      } finally {
        await upgrade?.end().catch(() => undefined);
        await admin.query(
          `SELECT pg_terminate_backend(pid)
           FROM pg_stat_activity
           WHERE datname = $1 AND pid <> pg_backend_pid()`,
          [databaseName],
        );
        await admin.query(`DROP DATABASE "${databaseName}"`);
        await admin.end();
      }
    },
    120_000,
  );
});

function predecessorBeautySnapshot() {
  const draft = deterministicDraft(
    {
      source: "Predecessor beauty",
      sourceUrl: "https://predecessor-beauty.example/",
      sourceLocale: "en",
      name: "Predecessor Beauty Studio",
      description:
        "A predecessor beauty snapshot with legacy commerce links.",
      address: "",
      phone: "",
      email: "",
      heroImageUrl: null,
      pageText: "Predecessor Beauty Studio",
      links: [],
    },
    beautyConfig,
  );
  return {
    draft,
    scalar: siteDraftScalarData(draft, beautyConfig.id),
    integrations: [
      legacyIntegration("booking", "Book", "https://booking.example/beauty"),
      legacyIntegration("ordering", "Order", "https://ordering.example/beauty"),
      legacyIntegration("delivery", "Delivery", "https://delivery.example/beauty"),
      legacyIntegration(
        "social",
        "Instagram",
        "https://www.instagram.com/predecessor_beauty/",
      ),
    ],
    translations: [
      {
        locale: "fr",
        eyebrow: "Aperçu beauté précédent",
        description:
          "Un ancien aperçu beauté avec des liens commerciaux enregistrés.",
        attributes: {},
        catalogSections: [
          { name: "Services", description: "", items: [] },
        ],
        integrationLabels: [
          "Réserver",
          "Commander",
          "Livraison",
          "Instagram",
        ],
      },
    ],
  };
}

function legacyIntegration(
  type: "booking" | "ordering" | "delivery" | "social",
  label: string,
  url: string,
) {
  return { type, label, provider: null, url, enabled: true, venueId: null };
}

async function applyMigration(
  client: Client,
  migrationName: string,
): Promise<void> {
  const sql = await readFile(
    `${migrationsDirectory}/${migrationName}/migration.sql`,
    "utf8",
  );
  await client.query(sql);
}

async function enumValues(client: Client, typeName: string): Promise<string[]> {
  const result = await client.query<{ value: string }>(
    `SELECT enumlabel AS value
     FROM pg_enum
     JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
     WHERE pg_type.typname = $1
     ORDER BY enumsortorder`,
    [typeName],
  );
  return result.rows.map((row) => row.value);
}
