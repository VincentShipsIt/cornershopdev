import { afterEach, describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { PersistedSiteDraftRecord } from "@/lib/sites";

mock.module("server-only", () => ({}));

let createdSiteData: Record<string, unknown> | null = null;
const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  createdSiteData = null;
});

const transaction = {
  site: {
    findFirst: async () => null,
    findUnique: async () => null,
    create: async (input: { data: Record<string, unknown> }) => {
      createdSiteData = input.data;
      return { id: "site_privacy", slug: String(input.data.slug) };
    },
  },
  auditEvent: { create: async () => ({ id: "audit_privacy" }) },
  importJob: { update: async () => ({ id: "import_privacy" }) },
};

mock.module("@/lib/db", () => ({
  getDb: () => ({
    $transaction: async <T,>(
      callback: (tx: typeof transaction) => Promise<T>,
    ): Promise<T> => callback(transaction),
  }),
}));

const { SiteRenderer } = await import("@/components/site-renderer");
const { persistSiteImport } = await import("@/lib/site-persistence");
const { projectSiteDraft } = await import("@/lib/sites");
const { restaurantConfig } = await import(
  "@/lib/verticals/restaurant/config"
);
const { restaurantSiteDraftSchema, sampleSiteDraft } = await import(
  "@/lib/verticals/restaurant/schema"
);

describe("site contact privacy", () => {
  it("persists, reloads, and renders the sourced business email without exposing the private lead recipient", async () => {
    process.env.DATABASE_URL = "postgresql://mocked.invalid/cornershopdev";
    const businessEmail = "hello@business.example";
    const leadContactEmail = "owner.private@example.test";
    const draft = restaurantSiteDraftSchema.parse({
      ...sampleSiteDraft,
      slug: "privacy-boundary",
      email: businessEmail,
    });

    await persistSiteImport({
      draft,
      vertical: restaurantConfig.id,
      source: "https://business.example/",
      importJobId: "import_privacy",
      actor: "operator:test",
      contactEmail: leadContactEmail,
    });

    expect(createdSiteData).toMatchObject({
      email: businessEmail,
      leadContactEmail,
    });

    const stored = storedSiteRecord(createdSiteData!);
    const loaded = projectSiteDraft(stored);
    const publicDraft = loaded.draft as typeof draft;
    const publicJson = JSON.stringify(publicDraft);
    const markup = renderToStaticMarkup(
      <SiteRenderer draft={publicDraft} vertical={restaurantConfig.id} />,
    );

    expect(publicDraft.email).toBe(businessEmail);
    expect(publicJson).toContain(businessEmail);
    expect(publicJson).not.toContain(leadContactEmail);
    expect(markup).toContain(`mailto:${businessEmail}`);
    expect(markup).not.toContain(leadContactEmail);
  });

  it("privately preserves every legacy recipient and clears every privacy-ambiguous public email", async () => {
    const migration = await Bun.file(
      new URL(
        "../../prisma/migrations/20260820200000_site_contact_privacy_and_catalog_availability/migration.sql",
        import.meta.url,
      ),
    ).text();

    expect(migration).toContain('"leadContactEmail" = "email"');
    expect(migration).toContain('AND "leadContactEmail" IS NULL;');
    expect(migration).not.toContain('"status" IN');
    expect(migration).toContain(
      'UPDATE "Site"\nSET "email" = NULL\nWHERE "email" IS NOT NULL;',
    );
  });
});

function storedSiteRecord(
  data: Record<string, unknown>,
): PersistedSiteDraftRecord {
  const catalogSections = data.catalogSections as {
    create: Array<{
      name: string;
      description: string;
      position: number;
      items: { create: Array<Record<string, unknown>> };
    }>;
  };
  const integrations = data.integrations as {
    create: Array<Record<string, unknown>>;
  };

  return {
    ...data,
    id: "site_privacy",
    catalogSections: catalogSections.create.map((section, sectionIndex) => ({
      id: `section_${sectionIndex}`,
      siteId: "site_privacy",
      ...section,
      items: section.items.create.map((item, itemIndex) => ({
        id: `item_${sectionIndex}_${itemIndex}`,
        sectionId: `section_${sectionIndex}`,
        ...item,
      })),
    })),
    integrations: integrations.create.map((integration, index) => ({
      id: `integration_${index}`,
      siteId: "site_privacy",
      createdAt: new Date(),
      updatedAt: new Date(),
      ...integration,
    })),
    photos: [],
  } as unknown as PersistedSiteDraftRecord;
}
