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
      "catalog",
      "conversion",
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

    expect(email.subject).toBe(
      "5 things Restofrontapp can improve for Chez Mira on Google",
    );
    expect(email.text).toContain("https://cornershop.dev/preview/chez-mira");
    for (const fix of audit.topFixes) {
      expect(email.text).toContain(fix.title);
      expect(email.text).toContain(fix.detail);
    }
    expect(email.text).not.toMatch(/michelin|best of|#1 restaurant|tripadvisor winner/i);
    expect(email.text).toContain("not an award");
    expect(email.text).not.toContain("guaranteed ranking");
  });

  it("uses beauty-specific audit evidence and sender identity", () => {
    const homepage = parseHomepageSignals(
      `<html><head><title>Studio Iris</title></head><body>Welcome</body></html>`,
      new URL("http://studio-iris.example/"),
      null,
      "BEAUTY",
    );
    const audit = auditLocalSeo({
      vertical: "BEAUTY",
      name: "Studio Iris",
      address: null,
      phone: null,
      city: "Valletta",
      websiteUrl: "http://studio-iris.example/",
      categories: [],
      hours: [],
      photoCount: 0,
      photoNewestAt: null,
      reviewCount: 0,
      description: null,
      homepage,
    });
    const email = renderLocalSeoOutreachEmail({
      vertical: "BEAUTY",
      name: "Studio Iris",
      previewUrl: "https://cornershop.dev/preview/studio-iris",
      audit,
    });

    expect(audit.checks.find((check) => check.id === "catalog")?.label).toContain(
      "Service or treatment list",
    );
    expect(audit.checks.find((check) => check.id === "conversion")?.label).toContain(
      "Appointment booking",
    );
    expect(email.subject).toContain("Salonfront");
    expect(email.text).toContain("BeautySalon or LocalBusiness markup");
    expect(email.text).not.toMatch(/restaurant|menu|diners/i);
  });
});
