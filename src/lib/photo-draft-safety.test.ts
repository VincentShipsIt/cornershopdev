import { describe, expect, test } from "bun:test";
import { withoutUnreviewedSourcePhotos } from "@/lib/photo-draft-safety";
import { sampleSiteDraft } from "@/lib/restaurant";

describe("imported photo draft safety", () => {
  test("keeps remote discovery images out of the persisted draft pending review", () => {
    const safe = withoutUnreviewedSourcePhotos(sampleSiteDraft);

    expect(safe.heroImageUrl).toBeNull();
    expect(safe.heroOriginalImageUrl).toBeNull();
    expect(safe.heroImageProvenance).toBeNull();
    expect(safe.galleryImages).toEqual([]);
    expect(
      safe.catalogSections.flatMap((section) =>
        section.items.map((item) => [
          item.imageUrl,
          item.originalImageUrl,
          item.imageProvenance,
        ]),
      ),
    ).toEqual(
      safe.catalogSections.flatMap((section) =>
        section.items.map(() => [null, null, null]),
      ),
    );
    expect(safe.name).toBe(sampleSiteDraft.name);
  });
});
