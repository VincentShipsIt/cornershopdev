import { describe, expect, it } from "bun:test";
import { restaurantThemeFixtures } from "@/lib/site-themes/restaurant/fixtures";
import { buildRestaurantJsonLd } from "@/lib/restaurant-json-ld";

describe("restaurant JSON-LD", () => {
  it("emits Restaurant markup with hours, menu, and booking URLs", () => {
    const fixture = restaurantThemeFixtures["terroir-editorial"];
    const jsonLd = buildRestaurantJsonLd({
      ...fixture,
      sourceUrl: "https://maison-serein.example/",
      businessHours: [{ days: "Tuesday–Saturday", hours: "19:00–22:30" }],
    });

    expect(jsonLd).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Restaurant",
      name: fixture.name,
      telephone: fixture.phone,
      url: "https://maison-serein.example/",
      servesCuisine: "Seasonal Mediterranean",
      menu: "https://maison-serein.example/#menu",
      acceptsReservations: "https://www.sevenrooms.com",
      openingHours: ["Tuesday–Saturday 19:00–22:30"],
    });
    expect(jsonLd.address).toEqual({
      "@type": "PostalAddress",
      streetAddress: fixture.address,
    });
  });
});
