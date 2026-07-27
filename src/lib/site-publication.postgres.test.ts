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
let updateSiteDraft: typeof import("@/lib/site-persistence").updateSiteDraft;
let findPublishedSiteView: typeof import("@/lib/sites").findPublishedSiteView;
let findSiteView: typeof import("@/lib/sites").findSiteView;
let Vertical: typeof import("@/generated/prisma/enums").Vertical;

describe.skipIf(!enabled)("safe draft and publish PostgreSQL integration", () => {
  beforeAll(async () => {
    const database = await import("@/lib/db");
    const restaurant = await import("@/lib/restaurant");
    const publication = await import("@/lib/site-publication");
    const persistence = await import("@/lib/site-persistence");
    const sites = await import("@/lib/sites");
    const enums = await import("@/generated/prisma/enums");

    db = database.getDb();
    sampleSiteDraft = restaurant.sampleSiteDraft;
    publishSiteDraft = publication.publishSiteDraft;
    updateSiteDraft = persistence.updateSiteDraft;
    findPublishedSiteView = sites.findPublishedSiteView;
    findSiteView = sites.findSiteView;
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
    await db.domain.create({
      data: {
        hostname: `${randomUUID()}.example.test`,
        siteId,
        verificationToken: randomUUID(),
        verified: true,
        verifiedAt: new Date(),
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
});
