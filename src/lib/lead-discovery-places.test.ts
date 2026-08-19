import { describe, expect, it } from "bun:test";
import { discoverLocalPlaces } from "@/lib/lead-discovery-places";

describe("place discovery", () => {
  it("uses Google Places when a key is supplied and never requires a live key", async () => {
    const fetchImpl = async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("places.googleapis.com");
      return Response.json({
        places: [
          {
            id: "ChIJ123",
            displayName: { text: "Chez Mira" },
            formattedAddress: "12 Rue des Vignes, Lyon, France",
            websiteUri: "https://www.chezmira.fr/",
            internationalPhoneNumber: "+33 4 00 00 00 00",
            rating: 4.4,
            userRatingCount: 88,
            types: ["restaurant", "french_restaurant", "point_of_interest"],
            regularOpeningHours: {
              weekdayDescriptions: ["Monday: Closed", "Tuesday: 7:00 PM – 10:00 PM"],
            },
            photos: [{ name: "places/ChIJ123/photos/1" }],
            editorialSummary: { overview: "A small Lyonnais dining room." },
          },
        ],
      });
    };

    const result = await discoverLocalPlaces({
      city: "Lyon",
      limit: 10,
      googlePlacesApiKey: "test-key",
      fetchImpl,
    });

    expect(result.provider).toBe("google_places");
    expect(result.places).toEqual([
      expect.objectContaining({
        name: "Chez Mira",
        websiteUrl: "https://www.chezmira.fr/",
        placeId: "ChIJ123",
        city: "Lyon",
        reviewCount: 88,
        categories: ["restaurant", "french_restaurant"],
        hours: [
          { days: "Monday", hours: "Closed" },
          { days: "Tuesday", hours: "7:00 PM – 10:00 PM" },
        ],
      }),
    ]);
  });

  it("falls back to Nominatim when no Google key is configured", async () => {
    const fetchImpl = async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("nominatim.openstreetmap.org");
      return Response.json([
        {
          name: "Trattoria Due",
          display_name: "Trattoria Due, Valletta, Malta",
          osm_type: "node",
          osm_id: 42,
          type: "restaurant",
          address: { city: "Valletta" },
          extratags: { website: "https://due.example", phone: "+356 2100 0000" },
        },
      ]);
    };

    const result = await discoverLocalPlaces({
      city: "Valletta",
      limit: 5,
      fetchImpl,
    });

    expect(result.provider).toBe("nominatim");
    expect(result.places[0]).toMatchObject({
      name: "Trattoria Due",
      placeId: "node/42",
      websiteUrl: "https://due.example",
      city: "Valletta",
    });
  });
});
