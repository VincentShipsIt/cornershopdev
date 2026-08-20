import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SourceNavigation } from "@/components/site-brand";
import { sourceDataSchema } from "@/lib/verticals/schema";

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
