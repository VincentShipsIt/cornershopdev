import { describe, expect, it } from "bun:test";
import { parseHomepageSignals } from "@/lib/lead-discovery";
import {
  auditLocalSeo,
  renderLocalSeoOutreachEmail,
} from "@/lib/local-seo-audit";

const weakHomepage = parseHomepageSignals(
  `<html><head><title>Home</title></head><body><p>Welcome</p></body></html>`,
  new URL("http://old-bistro.example/"),
);

describe("local SEO audit", () => {
  it("returns the five highest-weight fixes from the real checklist", () => {
    const audit = auditLocalSeo({
      name: "Chez Mira",
      address: "12 Rue des Vignes, Lyon",
      phone: "+33 4 00 00 00 00",
      city: "Lyon",
      websiteUrl: "http://old-bistro.example/",
      categories: [],
      hours: [],
      photoCount: 0,
      photoNewestAt: null,
      reviewCount: 0,
      description: "Bistro",
      homepage: weakHomepage,
    });

    expect(audit.topFixes).toHaveLength(5);
    expect(audit.topFixes.map((fix) => fix.id)).toEqual([
      "nap",
      "hours",
      "menu",
      "booking",
      "categories",
    ]);
    expect(audit.score).toBeLessThan(50);
    expect(audit.checks.every((entry) => entry.isPassed || entry.fix)).toBe(true);
  });

  it("renders the outreach template from audit data without invented awards", () => {
    const audit = auditLocalSeo({
      name: "Chez Mira",
      address: "12 Rue des Vignes, Lyon",
      phone: "+33 4 00 00 00 00",
      city: "Lyon",
      websiteUrl: "http://old-bistro.example/",
      categories: [],
      hours: [],
      photoCount: 0,
      photoNewestAt: null,
      reviewCount: 1,
      description: "Bistro",
      homepage: weakHomepage,
    });
    const email = renderLocalSeoOutreachEmail({
      name: "Chez Mira",
      previewUrl: "https://cornershop.dev/preview/chez-mira",
      audit,
    });

    expect(email.subject).toBe("5 things holding back Chez Mira on Google");
    expect(email.text).toContain("https://cornershop.dev/preview/chez-mira");
    for (const fix of audit.topFixes) {
      expect(email.text).toContain(fix.title);
      expect(email.text).toContain(fix.detail);
    }
    expect(email.text).not.toMatch(/michelin|best of|#1 restaurant|tripadvisor winner/i);
    expect(email.text).toContain("not an award");
    expect(email.text).not.toContain("guaranteed ranking");
  });
});
