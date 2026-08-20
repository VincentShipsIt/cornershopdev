import { describe, expect, it } from "bun:test";
import {
  liveSiteCanonicalPath,
  PUBLIC_SITE_VERSION_HEADER,
  previewCacheTagFor,
} from "@/lib/site-surface";

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

  it("builds absolute live canonicals on the public origin", () => {
    expect(
      liveSiteCanonicalPath("https://chez-lea.restofront.com", "en", "en"),
    ).toBe("https://chez-lea.restofront.com/");
    expect(
      liveSiteCanonicalPath("https://chez-lea.restofront.com", "fr", "en"),
    ).toBe("https://chez-lea.restofront.com/fr");
  });

  it("uses a non-secret response header for live version evidence", () => {
    expect(PUBLIC_SITE_VERSION_HEADER).toBe("x-cornershop-site-version");
  });
});
