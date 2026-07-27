import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  mock,
  test,
} from "bun:test";

mock.module("server-only", () => ({}));

const enabled = process.env.SITE_PUBLICATION_POSTGRES_TEST === "1";
const siteId = `site-publication-${randomUUID()}`;
const organizationId = `site-publication-org-${randomUUID()}`;
const userId = `site-publication-user-${randomUUID()}`;
const slug = `site-publication-${randomUUID()}`;
const actor = { id: userId, email: `${userId}@example.test` };

let db: ReturnType<typeof import("@/lib/db").getDb>;
let sampleSiteDraft: typeof import("@/lib/restaurant").sampleSiteDraft;
let publishSiteDraft: typeof import("@/lib/site-publication").publishSiteDraft;
let rollbackPublishedSiteVersion: typeof import("@/lib/site-publication").rollbackPublishedSiteVersion;
let updateSiteDraft: typeof import("@/lib/site-persistence").updateSiteDraft;
let findPublishedSiteView: typeof import("@/lib/sites").findPublishedSiteView;
let findSiteView: typeof import("@/lib/sites").findSiteView;
let localizeSiteDraft: typeof import("@/lib/site-draft").localizeSiteDraft;
let restaurantThemeFixtures: typeof import("@/lib/site-themes/restaurant/fixtures").restaurantThemeFixtures;
let selectOwnerRestaurantTheme: typeof import("@/lib/site-themes/restaurant/selection").selectOwnerRestaurantTheme;
let Vertical: typeof import("@/generated/prisma/enums").Vertical;

describe.skipIf(!enabled)("safe draft and publish PostgreSQL integration", () => {
  beforeAll(async () => {
    const database = await import("@/lib/db");
    const restaurant = await import("@/lib/restaurant");
    const publication = await import("@/lib/site-publication");
    const persistence = await import("@/lib/site-persistence");
    const sites = await import("@/lib/sites");
    const siteDraft = await import("@/lib/site-draft");
    const themeFixtures = await import(
      "@/lib/site-themes/restaurant/fixtures"
    );
    const themeSelection = await import(
      "@/lib/site-themes/restaurant/selection"
    );
    const enums = await import("@/generated/prisma/enums");

    db = database.getDb();
    sampleSiteDraft = restaurant.sampleSiteDraft;
    publishSiteDraft = publication.publishSiteDraft;
    rollbackPublishedSiteVersion =
      publication.rollbackPublishedSiteVersion;
    updateSiteDraft = persistence.updateSiteDraft;
    findPublishedSiteView = sites.findPublishedSiteView;
    findSiteView = sites.findSiteView;
    localizeSiteDraft = siteDraft.localizeSiteDraft;
    restaurantThemeFixtures = themeFixtures.restaurantThemeFixtures;
    selectOwnerRestaurantTheme =
      themeSelection.selectOwnerRestaurantTheme;
    Vertical = enums.Vertical;

    await db.user.create({
      data: {
        id: userId,
        email: actor.email,
        memberships: {
          create: {
            organization: {
              create: {
                id: organizationId,
                name: "Publication integration",
              },
            },
          },
        },
      },
    });
    await db.site.create({
      data: {
        id: siteId,
        slug,
        name: sampleSiteDraft.name,
        eyebrow: sampleSiteDraft.eyebrow,
        description: sampleSiteDraft.description,
        address: sampleSiteDraft.address,
        phone: sampleSiteDraft.phone,
        sourceUrl: sampleSiteDraft.sourceUrl,
        heroImageUrl: sampleSiteDraft.heroImageUrl,
        heroOriginalImageUrl: sampleSiteDraft.heroOriginalImageUrl,
        heroImageProvenance: "OWNER",
        draftTheme: { id: "warm" },
        draftThemeVersion: "legacy-v1",
        draftPalette: sampleSiteDraft.palette,
        attributes: sampleSiteDraft.attributes,
        autoEnhanceImages: sampleSiteDraft.autoEnhanceImages,
        defaultLocale: sampleSiteDraft.defaultLocale,
        translations: sampleSiteDraft.translations,
        vertical: "RESTAURANT",
        status: "CLAIMED",
        organizationId,
        integrations: {
          create: sampleSiteDraft.integrations.map(
            (integration, position) => ({
              type: integration.type.toUpperCase() as
                | "BOOKING"
                | "ORDERING"
                | "DELIVERY"
                | "SOCIAL",
              label: integration.label,
              provider: integration.provider,
              url: integration.url,
              venueId: integration.venueId,
              position,
            }),
          ),
        },
        catalogSections: {
          create: sampleSiteDraft.catalogSections.map(
            (section, sectionPosition) => ({
              name: section.name,
              description: section.description,
              position: sectionPosition,
              items: {
                create: section.items.map((item, itemPosition) => ({
                  name: item.name,
                  description: item.description,
                  price: item.price,
                  currency: item.currency,
                  imageUrl: item.imageUrl,
                  originalImageUrl: item.originalImageUrl,
                  imageProvenance: item.imageProvenance?.toUpperCase() as
                    | "OFFICIAL"
                    | "OWNER"
                    | undefined,
                  attributes: item.attributes,
                  position: itemPosition,
                })),
              },
            }),
          ),
        },
      },
    });
  });

  afterAll(async () => {
    await db.site.deleteMany({ where: { id: siteId } });
    await db.organization.deleteMany({ where: { id: organizationId } });
    await db.user.deleteMany({ where: { id: userId } });
  });

  test("does not let Publish bypass a paused lifecycle state", async () => {
    await db.site.update({
      where: { id: siteId },
      data: { status: "PAUSED" },
    });

    await expect(
      publishSiteDraft({
        siteId,
        slug,
        vertical: Vertical.RESTAURANT,
        actor,
        changeSummary: "Attempt to bypass pause",
      }),
    ).rejects.toThrow("Only claimed or live sites can be published");
    expect(
      await db.site.findUniqueOrThrow({
        where: { id: siteId },
        select: {
          publishedSiteVersionId: true,
          _count: { select: { siteVersions: true, auditEvents: true } },
        },
      }),
    ).toEqual({
      publishedSiteVersionId: null,
      _count: { siteVersions: 0, auditEvents: 0 },
    });

    await db.site.update({
      where: { id: siteId },
      data: { status: "CLAIMED" },
    });
  });

  test("publishes a validated immutable snapshot and audits the actor", async () => {
    const published = await publishSiteDraft({
      siteId,
      slug,
      vertical: Vertical.RESTAURANT,
      actor,
      changeSummary: "Initial customer launch",
      now: new Date("2026-07-26T20:00:00.000Z"),
    });

    expect(published).toMatchObject({
      version: 1,
      theme: { id: "warm", version: "legacy-v1" },
    });
    const site = await db.site.findUnique({
      where: { id: siteId },
      select: {
        status: true,
        publishedSiteVersionId: true,
        publishedSiteVersion: {
          select: {
            content: true,
            translations: true,
            integrations: true,
            palette: true,
            publishedBy: true,
            changeSummary: true,
          },
        },
        auditEvents: {
          where: { type: "site.published" },
          select: { actor: true, metadata: true },
        },
      },
    });

    expect(site?.status).toBe("LIVE");
    expect(site?.publishedSiteVersionId).toBe(published.id);
    expect(site?.publishedSiteVersion).toMatchObject({
      publishedBy: actor.id,
      changeSummary: "Initial customer launch",
      palette: sampleSiteDraft.palette,
      translations: sampleSiteDraft.translations,
      integrations: sampleSiteDraft.integrations,
    });
    expect(site?.publishedSiteVersion?.content).toMatchObject({
      slug,
      name: sampleSiteDraft.name,
      palette: sampleSiteDraft.palette,
    });
    expect(site?.auditEvents).toEqual([
      {
        actor: actor.id,
        metadata: expect.objectContaining({
          siteVersionId: published.id,
          version: 1,
          changeSummary: "Initial customer launch",
          actorEmail: actor.email,
        }),
      },
    ]);
  });

  test("keeps Save private until a later atomic publish", async () => {
    const firstPointer = (
      await db.site.findUniqueOrThrow({
        where: { id: siteId },
        select: { publishedSiteVersionId: true },
      })
    ).publishedSiteVersionId;
    const changedDraft = {
      ...sampleSiteDraft,
      slug,
      name: "Private draft name",
      description:
        "This description is visible in the owner preview but not on the public domain.",
      palette: {
        background: "#101010",
        foreground: "#f5f5f5",
        accent: "#dd5544",
      },
      attributes: {
        ...sampleSiteDraft.attributes,
        cuisine: "Japanese omakase",
      },
    };

    await updateSiteDraft(slug, changedDraft, Vertical.RESTAURANT);

    const afterSave = await db.site.findUniqueOrThrow({
      where: { id: siteId },
      select: {
        publishedSiteVersionId: true,
        siteVersions: { select: { id: true } },
      },
    });
    const [privateView, publicView] = await Promise.all([
      findSiteView(slug),
      findPublishedSiteView(slug),
    ]);
    expect(afterSave.publishedSiteVersionId).toBe(firstPointer);
    expect(afterSave.siteVersions).toHaveLength(1);
    expect(privateView?.draft.name).toBe("Private draft name");
    expect(privateView?.theme.id).toBe("nocturne");
    expect(publicView?.draft.name).toBe(sampleSiteDraft.name);
    expect(publicView?.draft.palette).toEqual(sampleSiteDraft.palette);
    expect(publicView?.theme).toMatchObject({
      id: "warm",
      version: "legacy-v1",
    });

    const second = await publishSiteDraft({
      siteId,
      slug,
      vertical: Vertical.RESTAURANT,
      actor,
      changeSummary: "Publish private copy and palette",
    });
    expect(second.version).toBe(2);
    expect(second.theme).toEqual({ id: "nocturne", version: "legacy-v1" });
    expect(second.id).not.toBe(firstPointer);
    expect((await findPublishedSiteView(slug))?.draft).toMatchObject({
      name: changedDraft.name,
      palette: changedDraft.palette,
    });
  });

  test("persists menu order, availability, currency and approved imagery", async () => {
    const firstSection = sampleSiteDraft.catalogSections[0];
    const secondSection = sampleSiteDraft.catalogSections[1];
    const editedDraft = {
      ...sampleSiteDraft,
      slug,
      catalogSections: [
        {
          ...secondSection,
          items: [...secondSection.items].reverse(),
        },
        {
          ...firstSection,
          items: firstSection.items.map((item, index) =>
            index === 0
              ? {
                  ...item,
                  price: 8.5,
                  currency: "GBP" as const,
                  available: false,
                  imageUrl: "/approved/menu-item.webp",
                  originalImageUrl: "/approved/menu-item.webp",
                  imageProvenance: "owner" as const,
                }
              : item,
          ),
        },
      ],
    };

    await updateSiteDraft(slug, editedDraft, Vertical.RESTAURANT);
    const reloaded = await findSiteView(slug);
    expect(
      reloaded?.draft.catalogSections.map((section) => section.name),
    ).toEqual([
      secondSection.name,
      firstSection.name,
    ]);
    expect(reloaded?.draft.catalogSections[0].items.map((item) => item.name))
      .toEqual([...secondSection.items].reverse().map((item) => item.name));
    expect(reloaded?.draft.catalogSections[1].items[0]).toMatchObject({
      price: 8.5,
      currency: "GBP",
      available: false,
      imageUrl: "/approved/menu-item.webp",
    });
  });

  test("versions and audits authorized integration saves without publishing", async () => {
    const before = await db.site.findUniqueOrThrow({
      where: { id: siteId },
      select: {
        draftRevision: true,
        publishedSiteVersionId: true,
        _count: { select: { siteVersions: true } },
      },
    });
    const first = sampleSiteDraft.integrations[0];
    const second = sampleSiteDraft.integrations[1];
    const editedDraft = {
      ...sampleSiteDraft,
      slug,
      integrations: [
        { ...second, enabled: false },
        {
          ...first,
          label: "Reserve securely",
          enabled: true,
        },
      ],
    };

    const saved = await updateSiteDraft(
      slug,
      editedDraft,
      Vertical.RESTAURANT,
      { actor },
    );
    const [reloaded, after, audit] = await Promise.all([
      findSiteView(slug),
      db.site.findUniqueOrThrow({
        where: { id: siteId },
        select: {
          draftRevision: true,
          publishedSiteVersionId: true,
          _count: { select: { siteVersions: true } },
        },
      }),
      db.auditEvent.findFirst({
        where: {
          siteId,
          type: "site.draft.saved",
          actor: actor.id,
        },
        orderBy: { createdAt: "desc" },
        select: { metadata: true },
      }),
    ]);

    expect(saved.revision).toBe(before.draftRevision + 1);
    expect(after).toEqual({
      draftRevision: saved.revision,
      publishedSiteVersionId: before.publishedSiteVersionId,
      _count: before._count,
    });
    expect(reloaded?.draft.integrations).toEqual([
      expect.objectContaining({
        label: second.label,
        enabled: false,
      }),
      expect.objectContaining({
        label: "Reserve securely",
        provider: first.provider,
        enabled: true,
      }),
    ]);
    expect(audit?.metadata).toMatchObject({
      revision: saved.revision,
      actorEmail: actor.email,
      integrationCount: 2,
      enabledIntegrationCount: 1,
    });
  });

  test("refuses to publish stale translated copy without moving the live pointer", async () => {
    const current = await findSiteView(slug);
    if (!current) throw new Error("Expected the persisted restaurant draft");
    const staleDraft = {
      ...current.draft,
      autoEnhanceImages: sampleSiteDraft.autoEnhanceImages,
      translations: [
        {
          locale: "fr" as const,
          status: "stale" as const,
          attributes: {
            cuisine: current.draft.attributes.cuisine,
          },
          eyebrow: current.draft.eyebrow,
          description: current.draft.description,
          catalogSections: current.draft.catalogSections.map((section) => ({
            name: section.name,
            description: section.description,
            items: section.items.map((item) => ({
              name: item.name,
              description: item.description,
              attributes: {
                dietaryLabels: item.attributes.dietaryLabels,
              },
            })),
          })),
          integrationLabels: current.draft.integrations.map(
            (integration) => integration.label,
          ),
        },
      ],
    };
    await updateSiteDraft(slug, staleDraft, Vertical.RESTAURANT);
    const before = await db.site.findUniqueOrThrow({
      where: { id: siteId },
      select: {
        publishedSiteVersionId: true,
        _count: { select: { siteVersions: true, auditEvents: true } },
      },
    });

    await expect(
      publishSiteDraft({
        siteId,
        slug,
        vertical: Vertical.RESTAURANT,
        actor,
        changeSummary: "Stale translation must not publish",
      }),
    ).rejects.toThrow("Review every stale translation before publishing");

    expect(
      await db.site.findUniqueOrThrow({
        where: { id: siteId },
        select: {
          publishedSiteVersionId: true,
          _count: { select: { siteVersions: true, auditEvents: true } },
        },
      }),
    ).toEqual(before);
    await updateSiteDraft(
      slug,
      { ...staleDraft, translations: [] },
      Vertical.RESTAURANT,
    );
  });

  test("leaves the live pointer untouched when persisted draft validation fails", async () => {
    const before = await db.site.findUniqueOrThrow({
      where: { id: siteId },
      select: {
        publishedSiteVersionId: true,
        _count: { select: { siteVersions: true, auditEvents: true } },
      },
    });
    await db.site.update({
      where: { id: siteId },
      data: {
        translations: [
          {
            locale: "fr",
            catalogSections: [],
            integrationLabels: [],
          },
        ],
      },
    });

    await expect(
      publishSiteDraft({
        siteId,
        slug,
        vertical: Vertical.RESTAURANT,
        actor,
        changeSummary: "This publish must fail",
      }),
    ).rejects.toThrow();

    const after = await db.site.findUniqueOrThrow({
      where: { id: siteId },
      select: {
        publishedSiteVersionId: true,
        _count: { select: { siteVersions: true, auditEvents: true } },
      },
    });
    expect(after).toEqual(before);
    await db.site.update({
      where: { id: siteId },
      data: { translations: [] },
    });
  });

  test("serializes concurrent publishes and never mutates published history", async () => {
    const results = await Promise.all([
      publishSiteDraft({
        siteId,
        slug,
        vertical: Vertical.RESTAURANT,
        actor,
        changeSummary: "Concurrent publish A",
      }),
      publishSiteDraft({
        siteId,
        slug,
        vertical: Vertical.RESTAURANT,
        actor,
        changeSummary: "Concurrent publish B",
      }),
    ]);
    const versions = await db.siteVersion.findMany({
      where: { siteId },
      orderBy: { version: "asc" },
      select: { id: true, version: true },
    });
    const pointer = await db.site.findUniqueOrThrow({
      where: { id: siteId },
      select: { publishedSiteVersionId: true },
    });

    expect(results.map((result) => result.version).sort()).toEqual([3, 4]);
    expect(versions.map((version) => version.version)).toEqual([1, 2, 3, 4]);
    expect(pointer.publishedSiteVersionId).toBe(versions.at(-1)?.id ?? null);

    await expect(
      Promise.resolve(
        db.siteVersion.update({
          where: { id: versions[0].id },
          data: { changeSummary: "Tampered history" },
        }),
      ),
    ).rejects.toThrow("Published site versions are immutable");
  });

  test("preserves an owner theme through save, reload, locale, publish and rollback", async () => {
    const fixture = restaurantThemeFixtures["counter-service"];
    const ownerSelection = selectOwnerRestaurantTheme(
      fixture.profile,
      "after-dark",
    );
    const ownerDraft = {
      ...fixture,
      slug,
      attributes: {
        ...fixture.attributes,
        themeSelection: ownerSelection,
      },
      translations: [
        {
          locale: "fr",
          attributes: { cuisine: "Comptoir italien" },
          eyebrow: "Des parts, des pizzas entières, sans détour",
          description:
            "Un comptoir de quartier pour des pizzas au levain, des boissons fraîches et une collecte rapide.",
          catalogSections: fixture.catalogSections.map((section) => ({
            name: section.name,
            description: section.description,
            items: section.items.map((item) => ({
              name: item.name,
              description: item.description,
              attributes: item.attributes,
            })),
          })),
          integrationLabels: fixture.integrations.map(
            (integration) => integration.label,
          ),
        },
      ],
    };

    await updateSiteDraft(slug, ownerDraft, Vertical.RESTAURANT);
    const reloaded = await findSiteView(slug);
    expect(reloaded?.theme).toEqual({
      id: "after-dark",
      version: "restaurant-renderer-v1",
      selection: ownerSelection,
    });
    expect(reloaded?.draft.attributes.themeSelection).toEqual(ownerSelection);
    expect(
      localizeSiteDraft(reloaded!.draft, "fr").attributes.themeSelection,
    ).toEqual(ownerSelection);

    const ownerPublished = await publishSiteDraft({
      siteId,
      slug,
      vertical: Vertical.RESTAURANT,
      actor,
      changeSummary: "Publish owner-selected after-dark theme",
    });
    expect(ownerPublished.theme).toEqual({
      id: "after-dark",
      version: "restaurant-renderer-v1",
    });
    const storedOwnerVersion = await db.siteVersion.findUniqueOrThrow({
      where: { id: ownerPublished.id },
      select: {
        theme: true,
        themeVersion: true,
        translations: true,
      },
    });
    expect(storedOwnerVersion).toMatchObject({
      theme: ownerSelection,
      themeVersion: "restaurant-renderer-v1",
      translations: ownerDraft.translations,
    });

    const nextSelection = selectOwnerRestaurantTheme(
      fixture.profile,
      "terroir-editorial",
    );
    await updateSiteDraft(
      slug,
      {
        ...ownerDraft,
        attributes: {
          ...ownerDraft.attributes,
          themeSelection: nextSelection,
        },
      },
      Vertical.RESTAURANT,
    );
    await publishSiteDraft({
      siteId,
      slug,
      vertical: Vertical.RESTAURANT,
      actor,
      changeSummary: "Publish a later owner theme",
    });

    const rolledBack = await rollbackPublishedSiteVersion({
      siteId,
      slug,
      vertical: Vertical.RESTAURANT,
      targetSiteVersionId: ownerPublished.id,
      actor,
    });
    expect(rolledBack.id).not.toBe(ownerPublished.id);
    expect(rolledBack.theme).toEqual(ownerPublished.theme);
    expect((await findPublishedSiteView(slug))?.draft.attributes.themeSelection)
      .toEqual(ownerSelection);
    expect(
      localizeSiteDraft((await findPublishedSiteView(slug))!.draft, "fr")
        .attributes.themeSelection,
    ).toEqual(ownerSelection);
    // Rollback moves only the public pointer; the owner's later private draft
    // remains available for another edit or publish.
    expect((await findSiteView(slug))?.draft.attributes.themeSelection).toEqual(
      nextSelection,
    );
    expect(
      await db.auditEvent.count({
        where: {
          siteId,
          type: "site.rolled_back",
          actor: actor.id,
        },
      }),
    ).toBe(1);
  });
});
