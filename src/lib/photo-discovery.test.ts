import { describe, expect, it } from "bun:test";
import { discoverSourcePhotos } from "@/lib/importer";

describe("first-party photo discovery", () => {
  it("deduplicates, filters decorative assets, and classifies candidates", () => {
    const photos = discoverSourcePhotos([
      {
        url: new URL("https://bistro.example/menu"),
        html: `
          <meta property="og:image" content="/photos/room.jpg">
          <img class="hero" src="/photos/room.jpg" width="1600" height="900" alt="Dining room">
          <img class="menu-card" srcset="/food/pasta-small.jpg 400w, /food/pasta.jpg 1200w" alt="Pasta dish">
          <img src="/assets/logo.svg" alt="Bistro logo">
          <img src="/pixel.gif" width="1" height="1">
        `,
      },
    ]);

    expect(photos).toHaveLength(2);
    expect(photos[0]).toMatchObject({
      sourceUrl: "https://bistro.example/photos/room.jpg",
      candidateUsages: ["GALLERY", "HERO"],
    });
    expect(photos[1]).toMatchObject({
      sourceUrl: "https://bistro.example/food/pasta.jpg",
      candidateUsages: ["GALLERY", "CATALOG"],
    });
  });

  it("keeps discovery bounded and records the source page", () => {
    const html = Array.from(
      { length: 60 },
      (_, index) => `<img src="/gallery/${index}.jpg" alt="Interior ${index}">`,
    ).join("");
    const photos = discoverSourcePhotos(
      [{ url: new URL("https://salon.example/gallery"), html }],
      5,
    );
    expect(photos).toHaveLength(5);
    expect(photos.every((photo) => photo.sourcePageUrl.endsWith("/gallery"))).toBe(
      true,
    );
  });
});
