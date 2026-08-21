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
              weekdayDescriptions: [
                "Monday: Closed",
                "Tuesday: 7:00 PM – 10:00 PM",
              ],
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
      expect(String(input)).toContain("nominatim.internal.example");
      return Response.json([
        {
          name: "Trattoria Due",
          display_name: "Trattoria Due, Valletta, Malta",
          osm_type: "node",
          osm_id: 42,
          type: "restaurant",
          address: { city: "Valletta" },
          extratags: {
            website: "https://due.example",
            phone: "+356 2100 0000",
          },
        },
      ]);
    };

    const result = await discoverLocalPlaces({
      city: "Valletta",
      limit: 5,
      nominatimBaseUrl: "https://nominatim.internal.example/search",
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

  it("fails closed without an approved configured discovery provider", async () => {
    const fetchImpl = async () => {
      throw new Error("no provider request should be attempted");
    };

    await expect(
      discoverLocalPlaces({ city: "Valletta", limit: 5, fetchImpl }),
    ).rejects.toThrow("requires GOOGLE_PLACES_API_KEY");
  });

  it("hard-blocks the public OSMF Nominatim endpoint", async () => {
    const fetchImpl = async () => {
      throw new Error("public Nominatim must not be called");
    };

    await expect(
      discoverLocalPlaces({
        city: "Valletta",
        limit: 5,
        nominatimBaseUrl: "https://nominatim.openstreetmap.org/search",
        fetchImpl,
      }),
    ).rejects.toThrow("requires GOOGLE_PLACES_API_KEY");
  });

  it("does not retry an approved fallback after that provider fails", async () => {
    let fallbackCalls = 0;
    const fetchImpl = async (input: RequestInfo | URL) => {
      if (String(input).includes("places.googleapis.com")) {
        return new Response(null, { status: 503 });
      }
      fallbackCalls += 1;
      return new Response(null, { status: 503 });
    };

    await expect(
      discoverLocalPlaces({
        city: "Valletta",
        limit: 5,
        googlePlacesApiKey: "test-key",
        nominatimBaseUrl: "https://nominatim.internal.example/search",
        fetchImpl,
      }),
    ).rejects.toThrow("Nominatim returned HTTP 503");
    expect(fallbackCalls).toBe(1);
  });

  it("uses the beauty adapter instead of restaurant search heuristics", async () => {
    const queries: string[] = [];
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain("places.googleapis.com");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      queries.push(String(body.textQuery));
      expect(body).not.toHaveProperty("includedType");
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
    expect(queries).toEqual([
      "beauty salons in Valletta",
      "hair salons in Valletta",
      "barber shops in Valletta",
      "nail salons in Valletta",
      "spas in Valletta",
    ]);
    expect(result.places).toHaveLength(1);
  });

  it("does not let the first beauty subtype starve later subtype results", async () => {
    const subtypeByQuery = new Map([
      ["beauty salons in Valletta", "beauty_salon"],
      ["hair salons in Valletta", "hair_salon"],
      ["barber shops in Valletta", "barber"],
      ["nail salons in Valletta", "nail_salon"],
      ["spas in Valletta", "spa"],
    ]);
    const fetchImpl = async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const query = String(body.textQuery);
      const subtype = subtypeByQuery.get(query);
      expect(subtype).toBeDefined();
      const resultCount = subtype === "beauty_salon" ? 5 : 1;
      return Response.json({
        places: Array.from({ length: resultCount }, (_, index) => ({
          id: `${subtype}-${index + 1}`,
          displayName: { text: `${subtype} ${index + 1}` },
          formattedAddress: "12 Republic Street, Valletta, Malta",
          types: [subtype, "point_of_interest"],
        })),
      });
    };

    const result = await discoverLocalPlaces({
      vertical: "BEAUTY",
      city: "Valletta",
      limit: 5,
      googlePlacesApiKey: "test-key",
      fetchImpl,
    });

    expect(result.places.map((place) => place.categories[0])).toEqual([
      "beauty_salon",
      "hair_salon",
      "barber",
      "nail_salon",
      "spa",
    ]);
  });

  it("queries every declared beauty subtype through Nominatim and deduplicates", async () => {
    const queries: string[] = [];
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      queries.push(url.searchParams.get("q") ?? "");
      const query = url.searchParams.get("q") ?? "";
      const type = query.startsWith("hair")
        ? "hair_salon"
        : query.startsWith("barber")
          ? "barber"
          : query.startsWith("nail")
            ? "nail_salon"
            : query.startsWith("spa")
              ? "spa"
              : "beauty_salon";
      return Response.json([
        {
          name: "Studio Iris",
          display_name: "Studio Iris, Valletta, Malta",
          osm_type: "node",
          osm_id: 42,
          type,
          address: { city: "Valletta" },
          extratags: { website: "https://studio-iris.example" },
        },
      ]);
    };

    const result = await discoverLocalPlaces({
      vertical: "BEAUTY",
      city: "Valletta",
      limit: 10,
      nominatimBaseUrl: "https://nominatim.internal.example/search",
      fetchImpl,
    });

    expect(queries).toEqual([
      "beauty salon in Valletta",
      "hair salon in Valletta",
      "barber shop in Valletta",
      "nail salon in Valletta",
      "spa in Valletta",
    ]);
    expect(result.places).toHaveLength(1);
    expect(result.places[0]?.categories).toEqual([
      "beauty_salon",
      "hair_salon",
      "barber",
      "nail_salon",
      "spa",
    ]);
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
      const fetchImpl = async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ) => {
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
