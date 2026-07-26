import { describe, expect, it } from "bun:test";
import {
  isLiveSiteSurface,
  LIVE_SITE_SLUG_HEADER,
  localeHref,
} from "@/lib/site-surface";

describe("live site surfaces", () => {
  it("requires the proxy-attested slug", () => {
    const headers = new Headers({
      [LIVE_SITE_SLUG_HEADER]: "chez-lea",
    });

    expect(isLiveSiteSurface(headers, "chez-lea")).toBe(true);
    expect(isLiveSiteSurface(headers, "another-site")).toBe(false);
    expect(isLiveSiteSurface(new Headers(), "chez-lea")).toBe(false);
  });

  it("keeps live locale links on the customer hostname", () => {
    expect(localeHref("/", "en", "en")).toBe("/");
    expect(localeHref("/", "fr", "en")).toBe("/fr");
  });

  it("keeps private preview locale links under the preview path", () => {
    expect(localeHref("/preview/chez-lea", "en", "en")).toBe(
      "/preview/chez-lea",
    );
    expect(localeHref("/preview/chez-lea", "fr", "en")).toBe(
      "/preview/chez-lea/fr",
    );
  });
});
