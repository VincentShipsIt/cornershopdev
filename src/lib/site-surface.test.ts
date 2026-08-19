import { describe, expect, it } from "bun:test";
import { previewCacheTagFor } from "@/lib/site-surface";

describe("previewCacheTagFor", () => {
  it("derives a stable tag from the slug", () => {
    expect(previewCacheTagFor("le-petit-meunier")).toBe(
      "preview-site:le-petit-meunier",
    );
  });

  it("keys the tag on the slug alone so a republish invalidates it", () => {
    // A rollback or republish changes which SiteVersion is current for a
    // slug; the cache tag must not embed a version id or the previous
    // version's cache entry would never be invalidated.
    expect(previewCacheTagFor("cafe-du-coin")).toBe(
      "preview-site:cafe-du-coin",
    );
  });

  it("keeps distinct slugs on distinct tags", () => {
    expect(previewCacheTagFor("site-a")).not.toBe(previewCacheTagFor("site-b"));
  });
});
