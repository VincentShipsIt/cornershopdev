import { describe, expect, it } from "bun:test";
import {
  buildLocalServiceJsonLd,
  serializeLocalServiceJsonLd,
} from "@/lib/local-service-json-ld";
import { sampleLocalServiceSiteDraft } from "@/lib/verticals/local-service/fixtures";

describe("local-service JSON-LD", () => {
  it("emits the narrow LocalBusiness subtype with services and service areas", () => {
    const jsonLd = buildLocalServiceJsonLd(sampleLocalServiceSiteDraft);
    expect(jsonLd).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Electrician",
      name: "Harbour Electrical",
      telephone: "+356 7999 1122",
      openingHours: [
        "Monday–Friday 08:00–18:00",
        "Saturday 08:00–13:00",
      ],
    });
    expect(jsonLd.areaServed?.map(({ name }) => name)).toEqual([
      "Valletta",
      "Floriana",
      "Three Cities",
    ]);
    expect(jsonLd.makesOffer?.map(({ itemOffered }) => itemOffered.name)).toEqual([
      "Fault finding and repairs",
      "Rewires and upgrades",
    ]);
    expect(jsonLd.potentialAction?.map(({ target }) => target)).toEqual([
      "https://wa.me/35679991122",
      "https://example.com/harbour-electrical/quote",
    ]);
  });

  it("escapes tag openings before inserting JSON-LD into a script tag", () => {
    expect(
      serializeLocalServiceJsonLd({
        ...sampleLocalServiceSiteDraft,
        description: "Trusted <script>alert(1)</script>",
      }),
    ).not.toContain("<script>");
  });
});
