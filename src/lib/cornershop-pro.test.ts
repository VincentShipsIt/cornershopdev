import { describe, expect, it } from "bun:test";
import { leadSiteDrafts } from "@/lib/lead-drafts";
import {
  isCornershopProClient,
  isTrustedCornershopProSite,
  ownerPreviewHref,
  proAppPath,
  proSiteBasePath,
  resolveProOwnerAppUrl,
} from "@/lib/cornershop-pro";
import { normalizeImportSource } from "@/lib/import-identity";

describe("cornershop pro routes", () => {
  it("registers servizo as a studio client", () => {
    expect(isCornershopProClient("servizo")).toBe(true);
    expect(isCornershopProClient("le-petit-meunier")).toBe(false);
  });

  it("builds the pro site and app paths", () => {
    expect(proSiteBasePath("servizo")).toBe("/pro/servizo");
    expect(proAppPath("servizo")).toBe("/pro/servizo/app");
    expect(ownerPreviewHref("servizo")).toBe("/pro/servizo");
    expect(ownerPreviewHref("le-petit-meunier")).toBe(
      "/preview/le-petit-meunier",
    );
  });

  it("resolves Pulse from the Servizo fixture integrations", () => {
    const draft = leadSiteDrafts.servizo;
    expect(resolveProOwnerAppUrl("servizo", draft.integrations)).toBe(
      "https://appservizocom.vercel.app/",
    );
  });

  it("rejects slug-squat imports on pro surfaces", () => {
    const draft = leadSiteDrafts.servizo;
    expect(
      isTrustedCornershopProSite("servizo", {
        sourceUrl: "https://evil.example/",
      }),
    ).toBe(false);
    expect(
      isTrustedCornershopProSite("servizo", {
        sourceUrl: draft.sourceUrl,
      }),
    ).toBe(true);
    expect(
      normalizeImportSource(draft.sourceUrl ?? ""),
    ).toBe(normalizeImportSource("https://www.servizo.com/"));
  });
});
