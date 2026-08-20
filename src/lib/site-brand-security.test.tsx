import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteBrand, SourceNavigation } from "@/components/site-brand";
import {
  siteImageUrlSchema,
  sourceDataSchema,
} from "@/lib/verticals/schema";

describe("source navigation security", () => {
  it.each([
    "https://source.example/menu",
    "/menu",
    "/menu?service=dinner#starters",
    "?service=dinner",
    "#starters",
  ])("accepts and renders safe storefront href %s", (url) => {
    const sourceData = sourceDataSchema.parse({
      navigation: [{ label: "Menu", url }],
    });

    const markup = renderToStaticMarkup(
      <SourceNavigation draft={{ sourceData }} />,
    );

    expect(markup).toContain(`href="${url.replaceAll("&", "&amp;")}"`);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "//attacker.example/menu",
    "/\\attacker.example/menu",
    "https:\\attacker.example/menu",
    "https://exa\nmple.com/menu",
    "http://source.example/menu",
    "mailto:owner@source.example",
    "menu",
  ])("rejects unsafe storefront href %s before rendering", (url) => {
    expect(
      sourceDataSchema.safeParse({
        navigation: [{ label: "Menu", url }],
      }).success,
    ).toBe(false);
  });
});

describe("site brand image security", () => {
  it.each([
    "https://images.example/logo.svg",
    "/brands/restaurant/logo.svg",
  ])("accepts and renders safe brand image %s", (logoUrl) => {
    const parsedLogo = siteImageUrlSchema.parse(logoUrl);
    const markup = renderToStaticMarkup(
      <SiteBrand draft={{ name: "Safe Brand", logoUrl: parsedLogo }} />,
    );

    expect(markup).toContain("data-source-brand-mark");
    expect(markup).toContain(logoUrl);
  });

  it.each([
    "javascript:alert(1)",
    "data:image/svg+xml,<svg onload=alert(1)>",
    'https://images.example/logo.svg");color:red;--x:("',
    "https:\\images.example/logo.svg",
    "https://user:pass@images.example/logo.svg",
    "https://images.example:8443/logo.svg",
    "https://127.0.0.1/logo.svg",
  ])("rejects unsafe brand image %s before CSS rendering", (logoUrl) => {
    expect(siteImageUrlSchema.safeParse(logoUrl).success).toBe(false);
  });
});
