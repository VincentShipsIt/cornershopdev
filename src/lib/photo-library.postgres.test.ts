import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const enabled = process.env.PHOTO_LIBRARY_POSTGRES_TEST === "1";
const siteId = `photo-site-${randomUUID()}`;
const slug = `photo-${randomUUID()}`;
const actor = { id: `owner-${randomUUID()}`, role: "owner" as const };

let db: ReturnType<typeof import("@/lib/db").getDb>;
let getPhotoLibrary: typeof import("@/lib/photo-library").getPhotoLibrary;
let reviewPhoto: typeof import("@/lib/photo-library").reviewPhoto;
let photoId: string;
let catalogPhotoId: string;
let catalogItemId: string;
let secondCatalogItemId: string;

describe.skipIf(!enabled)("photo library PostgreSQL persistence", () => {
  beforeAll(async () => {
    const database = await import("@/lib/db");
    const library = await import("@/lib/photo-library");
    db = database.getDb();
    getPhotoLibrary = library.getPhotoLibrary;
    reviewPhoto = library.reviewPhoto;

    const site = await db.site.create({
      data: {
        id: siteId,
        slug,
        name: "Photo Test Bistro",
        description: "A real fixture used only for photo persistence checks.",
        sourceUrl: "https://photo-test.example/",
        draftPalette: {
          background: "#ffffff",
          foreground: "#111111",
          accent: "#aa0000",
        },
        attributes: { cuisine: "Bistro", showMenuImages: true },
        status: "CLAIMED",
        catalogSections: {
          create: {
            name: "Menu",
            position: 0,
            items: {
              create: [
                { name: "Pasta", position: 0 },
                { name: "Tiramisu", position: 1 },
              ],
            },
          },
        },
      },
      select: {
        catalogSections: {
          select: { items: { select: { id: true } } },
        },
      },
    });
    catalogItemId = site.catalogSections[0]!.items[0]!.id;
    secondCatalogItemId = site.catalogSections[0]!.items[1]!.id;
    const hero = await db.photoAsset.create({
      data: {
        siteId,
        sourceUrl: "https://photo-test.example/room.jpg",
        sourcePageUrl: "https://photo-test.example/",
        provenance: "OFFICIAL",
        sourceKind: "FIRST_PARTY",
        contentSha256: "a".repeat(64),
        originalStorageKey: `test/${"a".repeat(64)}.jpg`,
        originalUrl: "https://assets.example/original-room.jpg",
        mediaType: "image/jpeg",
        byteLength: 1_024,
        candidateUsages: ["HERO", "GALLERY"],
      },
    });
    photoId = hero.id;
    const catalog = await db.photoAsset.create({
      data: {
        siteId,
        sourceUrl: "owner-upload:test:pasta.jpg",
        provenance: "OWNER",
        sourceKind: "OWNER_UPLOAD",
        contentSha256: "b".repeat(64),
        originalStorageKey: `test/${"b".repeat(64)}.jpg`,
        originalUrl: "https://assets.example/original-pasta.jpg",
        mediaType: "image/jpeg",
        byteLength: 1_024,
        candidateUsages: ["CATALOG"],
        reviewStatus: "APPROVED",
        reviewedAt: new Date(),
        reviewedBy: `owner:${actor.id}`,
      },
    });
    catalogPhotoId = catalog.id;
  });

  afterAll(async () => {
    await db.site.deleteMany({ where: { id: siteId } });
  });

  test("enforces content dedupe and persists reviewed hero selection", async () => {
    let duplicateCode: string | null = null;
    try {
      await db.photoAsset.create({
        data: {
          siteId,
          sourceUrl: "https://cdn.example/duplicate.jpg",
          provenance: "OFFICIAL",
          sourceKind: "FIRST_PARTY",
          contentSha256: "a".repeat(64),
          originalStorageKey: "test/duplicate.jpg",
          originalUrl: "https://assets.example/duplicate.jpg",
          mediaType: "image/jpeg",
          byteLength: 1_024,
          candidateUsages: ["GALLERY"],
        },
      });
    } catch (error) {
      duplicateCode = (error as { code?: string }).code ?? null;
    }
    expect(duplicateCode).toBe("P2002");

    await reviewPhoto({
      siteId,
      photoId,
      actor,
      review: { action: "approve_original" },
    });
    await reviewPhoto({
      siteId,
      photoId,
      actor,
      review: { action: "select_hero" },
    });
    expect(
      await db.site.findUniqueOrThrow({
        where: { id: siteId },
        select: {
          heroImageUrl: true,
          heroOriginalImageUrl: true,
          heroImageProvenance: true,
          draftRevision: true,
        },
      }),
    ).toEqual({
      heroImageUrl: "https://assets.example/original-room.jpg",
      heroOriginalImageUrl: "https://assets.example/original-room.jpg",
      heroImageProvenance: "OFFICIAL",
      draftRevision: 1,
    });
  });

  test("requires before/after approval and restores the immutable original", async () => {
    await db.photoAsset.update({
      where: { id: photoId },
      data: {
        enhancedUrl: "https://assets.example/enhanced-room.webp",
        enhancedStorageKey: "test/enhanced-room.webp",
        enhancedReviewStatus: "PENDING",
        enhancementStatus: "SUCCEEDED",
        enhancementModel: "google/gemini-3.1-flash-image",
        enhancementConfigVersion: "abc123def4567890",
        enhancementCostMicros: 12_345,
      },
    });
    await db.photoEnhancementRun.create({
      data: {
        siteId,
        photoId,
        idempotencyKey: `${siteId}:${photoId}:postgres-test`,
        status: "SUCCEEDED",
        model: "google/gemini-3.1-flash-image",
        configVersion: "abc123def4567890",
        estimatedCostMicros: 25_000,
        actualCostMicros: 12_345,
        requestedBy: `owner:${actor.id}`,
        completedAt: new Date(),
      },
    });
    await reviewPhoto({
      siteId,
      photoId,
      actor,
      review: { action: "approve_enhancement" },
    });
    expect(
      await db.site.findUniqueOrThrow({
        where: { id: siteId },
        select: { heroImageUrl: true },
      }),
    ).toEqual({ heroImageUrl: "https://assets.example/enhanced-room.webp" });

    await reviewPhoto({
      siteId,
      photoId,
      actor,
      review: { action: "restore_original" },
    });
    expect(
      await db.site.findUniqueOrThrow({
        where: { id: siteId },
        select: { heroImageUrl: true },
      }),
    ).toEqual({ heroImageUrl: "https://assets.example/original-room.jpg" });
  });

  test("selects a real catalog photo and reports committed cost plus audit history", async () => {
    await reviewPhoto({
      siteId,
      photoId: catalogPhotoId,
      actor,
      review: { action: "select_catalog", catalogItemId },
    });
    expect(
      await db.catalogItem.findUniqueOrThrow({
        where: { id: catalogItemId },
        select: { imageUrl: true, originalImageUrl: true, imageProvenance: true },
      }),
    ).toEqual({
      imageUrl: "https://assets.example/original-pasta.jpg",
      originalImageUrl: "https://assets.example/original-pasta.jpg",
      imageProvenance: "OWNER",
    });
    await reviewPhoto({
      siteId,
      photoId: catalogPhotoId,
      actor,
      review: { action: "select_catalog", catalogItemId: secondCatalogItemId },
    });
    expect(
      await db.catalogItem.findMany({
        where: { id: { in: [catalogItemId, secondCatalogItemId] } },
        orderBy: { position: "asc" },
        select: { imageUrl: true },
      }),
    ).toEqual([
      { imageUrl: null },
      { imageUrl: "https://assets.example/original-pasta.jpg" },
    ]);
    const library = await getPhotoLibrary(siteId);
    expect(library.budget.committedMicros).toBe(12_345);
    expect(library.photos).toHaveLength(2);
    expect(
      await db.auditEvent.count({
        where: { siteId, type: { startsWith: "photo." } },
      }),
    ).toBeGreaterThanOrEqual(5);
  });
});
