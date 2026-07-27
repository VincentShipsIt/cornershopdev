import { describe, expect, it } from "bun:test";
import { buildSourceMonitoringDiff } from "@/lib/source-monitoring-diff";

describe("evidence-backed source diffs", () => {
  it("emits menu, contact, hours and link suggestions with evidence", () => {
    const current = draft();
    const proposed = {
      ...draft(),
      phone: "+356 9999 0000",
      businessHours: [{ days: "Monday-Friday", hours: "09:00-18:00" }],
      catalogSections: [
        {
          name: "Lunch",
          description: "",
          items: [
            {
              name: "New pasta",
              description: "Tomato",
              price: 18,
              currency: "EUR",
              available: true,
              attributes: {},
              imageUrl: null,
            },
          ],
        },
      ],
    };
    const result = buildSourceMonitoringDiff({
      current,
      proposed,
      extracted: {
        source: "example.com",
        sourceUrl: "https://example.com/",
        sourceLocale: "en",
        name: "Example",
        description: "",
        address: "",
        phone: "+356 9999 0000",
        heroImageUrl: null,
        pageText:
          "Contact +356 9999 0000. Monday-Friday 09:00-18:00. Lunch: New pasta, Tomato, €18.",
        links: [
          {
            type: "booking",
            label: "Book",
            provider: "Provider",
            url: "https://book.example.com/",
          },
        ],
      },
      checkedLinks: [],
      capturedAt: new Date("2026-07-27T00:00:00.000Z"),
    });
    expect(result.map((entry) => entry.field).sort()).toEqual([
      "CONTACT",
      "HOURS",
      "LINKS",
      "MENU",
    ]);
    expect(result.every((entry) => entry.evidence.length > 0)).toBe(true);
  });

  it("drops AI-proposed facts that are absent from source evidence", () => {
    const current = draft();
    const result = buildSourceMonitoringDiff({
      current,
      proposed: {
        ...current,
        phone: "invented",
        businessHours: [{ days: "Sunday", hours: "24 hours" }],
        catalogSections: [
          {
            name: "Fantasy",
            description: "",
            items: [
              {
                name: "Imaginary dish",
                description: "",
                price: 99,
                currency: "EUR",
                available: true,
                attributes: {},
                imageUrl: null,
              },
            ],
          },
        ],
      },
      extracted: {
        source: "example.com",
        sourceUrl: "https://example.com/",
        sourceLocale: "en",
        name: "Example",
        description: "",
        address: "",
        phone: "",
        heroImageUrl: null,
        pageText: "Welcome to Example",
        links: [],
      },
      checkedLinks: [],
      capturedAt: new Date(),
    });
    expect(result).toEqual([]);
  });
});

function draft() {
  return {
    slug: "example",
    name: "Example",
    eyebrow: "",
    description: "A sufficiently long example business description.",
    address: "",
    phone: "",
    sourceUrl: "https://example.com/",
    heroImageUrl: null,
    palette: { background: "#fff", foreground: "#000", accent: "#f00" },
    attributes: {},
    autoEnhanceImages: false,
    defaultLocale: "en",
    businessHours: [],
    translations: [],
    catalogSections: [
      {
        name: "Menu",
        description: "",
        items: [],
      },
    ],
    integrations: [],
  };
}
