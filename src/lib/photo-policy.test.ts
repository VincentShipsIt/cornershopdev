import { describe, expect, it } from "bun:test";
import {
  canReservePhotoEnhancement,
  enhancementReservationMicros,
  getPhotoSystemConfig,
  mapWithConcurrency,
  photoEnhancementConfigVersion,
  photoEnhancementIdempotencyKey,
  recordedEnhancementCostMicros,
} from "@/lib/photo-policy";

const vertical = {
  id: "RESTAURANT" as const,
  imageEnhancement: {
    subject: "restaurant photograph",
    contextLabel: "Restaurant",
    forbiddenElements: "food and plating",
    sceneClause: "change the room",
    fidelityClause: "change what is served",
    gradeClause: "Use a natural grade.",
  },
};

describe("photo-system policy", () => {
  it("loads bounded economical defaults", () => {
    expect(getPhotoSystemConfig({})).toMatchObject({
      model: "google/gemini-3.1-flash-image",
      discoveryMaxImages: 8,
      enhancementConcurrency: 2,
      estimatedCostMicros: 25_000,
      perImageCostCeilingMicros: 50_000,
      perSiteCostCeilingMicros: 500_000,
    });
  });

  it("rejects unapproved models and inconsistent ceilings", () => {
    expect(() =>
      getPhotoSystemConfig({ PHOTO_ENHANCEMENT_MODEL: "openrouter/auto" }),
    ).toThrow("approved fast image-edit model");
    expect(() =>
      getPhotoSystemConfig({
        PHOTO_ENHANCEMENT_ESTIMATED_COST_MICROS: "60000",
        PHOTO_ENHANCEMENT_PER_IMAGE_CEILING_MICROS: "50000",
      }),
    ).toThrow("per-image ceiling");
  });

  it("reserves against the ceiling and uses a bounded provider cost", () => {
    expect(
      enhancementReservationMicros({
        configuredEstimateMicros: 25_000,
        perImageCeilingMicros: 50_000,
      }),
    ).toBe(25_000);
    expect(recordedEnhancementCostMicros(null, 25_000, 50_000)).toBe(25_000);
    expect(recordedEnhancementCostMicros(75_000, 25_000, 50_000)).toBe(75_000);
    expect(
      canReservePhotoEnhancement({
        committedMicros: 475_000,
        reservationMicros: 25_000,
        siteCeilingMicros: 500_000,
      }),
    ).toBe(true);
    expect(
      canReservePhotoEnhancement({
        committedMicros: 475_001,
        reservationMicros: 25_000,
        siteCeilingMicros: 500_000,
      }),
    ).toBe(false);
  });

  it("derives stable, scope-specific idempotency keys", () => {
    const first = photoEnhancementIdempotencyKey({
      siteId: "site-a",
      photoId: "photo-a",
      requestKey: "request-12345678",
    });
    expect(first).toBe(
      photoEnhancementIdempotencyKey({
        siteId: "site-a",
        photoId: "photo-a",
        requestKey: "request-12345678",
      }),
    );
    expect(first).not.toBe(
      photoEnhancementIdempotencyKey({
        siteId: "site-a",
        photoId: "photo-b",
        requestKey: "request-12345678",
      }),
    );
  });

  it("versions finishing notes so immutable derivatives never alias", () => {
    const config = getPhotoSystemConfig({});
    const base = photoEnhancementConfigVersion(config, vertical);
    expect(photoEnhancementConfigVersion(config, vertical, "Crop slightly")).not.toBe(
      base,
    );
    expect(
      photoEnhancementConfigVersion(config, vertical, " Crop slightly "),
    ).toBe(photoEnhancementConfigVersion(config, vertical, "Crop slightly"));
  });

  it("never exceeds the configured mapper concurrency", async () => {
    let active = 0;
    let maximum = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active -= 1;
      return value * 2;
    });
    expect(result).toEqual([2, 4, 6, 8, 10]);
    expect(maximum).toBe(2);
  });
});
