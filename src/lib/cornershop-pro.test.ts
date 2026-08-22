import { describe, expect, it } from "bun:test";
import { leadSiteDrafts } from "@/lib/lead-drafts";
import {
  isCornershopProClient,
  ownerPreviewHref,
  proAppPath,
  proSiteBasePath,
  resolveProOwnerAppUrl,
} from "@/lib/cornershop-pro";

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
    expect(resolveProOwnerAppUrl(draft.integrations)).toBe(
      "https://appservizocom.vercel.app/",
    );
  });
});
