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

  it("uses the beauty adapter instead of restaurant search heuristics", async () => {
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain("places.googleapis.com");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body).toMatchObject({
        textQuery: "beauty salons and barbers in Valletta",
        includedType: "beauty_salon",
      });
      return Response.json({
        places: [
          {
            id: "beauty-1",
            displayName: { text: "Studio Iris" },
            formattedAddress: "12 Republic Street, Valletta, Malta",
            types: ["beauty_salon", "point_of_interest"],
          },
        ],
      });
    };

    const result = await discoverLocalPlaces({
      vertical: "BEAUTY",
      city: "Valletta",
      limit: 5,
      googlePlacesApiKey: "test-key",
      fetchImpl,
    });

    expect(result.places[0]).toMatchObject({
      name: "Studio Iris",
      categories: ["beauty_salon"],
    });
  });

  it.each([
    [
      "FOOD_RETAIL" as const,
      "bakeries, pastry shops, butchers, delis, cheesemongers and grocers in Valletta",
      "Valletta Bakery",
      "bakery",
    ],
    [
      "LOCAL_SERVICE" as const,
      "plumbers, electricians, builders, repair services and artisans in Valletta",
      "Valletta Electrics",
      "electrician",
    ],
  ])(
    "uses the bounded %s taxonomy without a misleading Google includedType",
    async (vertical, textQuery, name, category) => {
      const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toContain("places.googleapis.com");
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body.textQuery).toBe(textQuery);
        expect(body).not.toHaveProperty("includedType");
        return Response.json({
          places: [
            {
              id: `${vertical.toLowerCase()}-1`,
              displayName: { text: name },
              formattedAddress: "12 Republic Street, Valletta, Malta",
              types: [category, "point_of_interest"],
            },
          ],
        });
      };

      const result = await discoverLocalPlaces({
        vertical,
        city: "Valletta",
        limit: 5,
        googlePlacesApiKey: "test-key",
        fetchImpl,
      });

      expect(result.places[0]).toMatchObject({ name, categories: [category] });
    },
  );
});
