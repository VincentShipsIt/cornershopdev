import {
  LEAD_DISCOVERY_USER_AGENT,
  type DiscoveryFetch,
  type LeadDiscoveryProvider,
} from "@/lib/lead-discovery";
import { Vertical } from "@/generated/prisma/enums";
import { resolveLeadDiscoveryAdapter } from "@/lib/lead-generation/registry";
import type { VerticalId } from "@/lib/verticals/types";
import { resolveVerticalConfig } from "@/lib/verticals/registry";

export type DiscoveredPlace = {
  name: string;
  websiteUrl: string | null;
  phone: string | null;
  address: string | null;
  city: string;
  placeId: string;
  provider: LeadDiscoveryProvider;
  rating: number | null;
  reviewCount: number | null;
  categories: string[];
  hours: Array<{ days: string; hours: string }>;
  photoCount: number;
  photoNewestAt: string | null;
  description: string | null;
};

export type PlaceDiscoveryResult = {
  places: DiscoveredPlace[];
  provider: LeadDiscoveryProvider;
  fallbackReason: string | null;
};

const GOOGLE_TEXT_SEARCH_URL =
  "https://places.googleapis.com/v1/places:searchText";
const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const GENERIC_PLACE_TYPES = new Set([
  "point_of_interest",
  "establishment",
  "food",
  "store",
  "place_of_worship",
]);

export async function discoverLocalPlaces(input: {
  vertical?: VerticalId;
  city: string;
  limit: number;
  googlePlacesApiKey?: string | null;
  fetchImpl?: DiscoveryFetch;
}): Promise<PlaceDiscoveryResult> {
  const vertical = input.vertical ?? Vertical.RESTAURANT;
  const fetchImpl = input.fetchImpl ?? fetch;
  const city = input.city.trim();
  const limit = Math.min(100, Math.max(1, input.limit));
  const apiKey = input.googlePlacesApiKey?.trim() || null;

  if (apiKey) {
    try {
      const places = await searchGooglePlaces({
        vertical,
        city,
        limit,
        apiKey,
        fetchImpl,
      });
      if (places.length > 0) {
        return { places, provider: "google_places", fallbackReason: null };
      }
      return {
        places: await searchNominatimPlaces({
          vertical,
          city,
          limit,
          fetchImpl,
        }),
        provider: "nominatim",
        fallbackReason: `Google Places returned no ${resolveVerticalConfig(vertical).marketing.audience}`,
      };
    } catch (error) {
      return {
        places: await searchNominatimPlaces({
          vertical,
          city,
          limit,
          fetchImpl,
        }),
        provider: "nominatim",
        fallbackReason:
          error instanceof Error
            ? error.message
            : "Google Places request failed",
      };
    }
  }

  return {
    places: await searchNominatimPlaces({
      vertical,
      city,
      limit,
      fetchImpl,
    }),
    provider: "nominatim",
    fallbackReason: null,
  };
}

export async function searchGooglePlaces(input: {
  vertical: VerticalId;
  city: string;
  limit: number;
  apiKey: string;
  fetchImpl: DiscoveryFetch;
}): Promise<DiscoveredPlace[]> {
  const adapter = resolveLeadDiscoveryAdapter(input.vertical);
  const places: DiscoveredPlace[] = [];
  let pageToken: string | null = null;

  while (places.length < input.limit) {
    const pageSize = Math.min(20, input.limit - places.length);
    const body: Record<string, unknown> = {
      textQuery: adapter.placeSearch.googleQuery(input.city),
      pageSize,
      languageCode: "en",
    };
    if (adapter.placeSearch.googleIncludedType) {
      body.includedType = adapter.placeSearch.googleIncludedType;
    }
    if (pageToken) body.pageToken = pageToken;

    const response = await input.fetchImpl(GOOGLE_TEXT_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": input.apiKey,
        "X-Goog-FieldMask": [
          "places.id",
          "places.displayName",
          "places.formattedAddress",
          "places.nationalPhoneNumber",
          "places.internationalPhoneNumber",
          "places.websiteUri",
          "places.rating",
          "places.userRatingCount",
          "places.types",
          "places.regularOpeningHours.weekdayDescriptions",
          "places.photos",
          "places.editorialSummary",
          "nextPageToken",
        ].join(","),
        "User-Agent": LEAD_DISCOVERY_USER_AGENT,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`Google Places returned HTTP ${response.status}`);
    }

    const payload = asRecord(await response.json());
    const rows = Array.isArray(payload?.places) ? payload.places : [];
    for (const row of rows) {
      const place = parseGooglePlace(row, input.city);
      if (place) places.push(place);
      if (places.length >= input.limit) break;
    }

    const next = asString(payload?.nextPageToken);
    if (!next || rows.length === 0) break;
    pageToken = next;
  }

  return places;
}

export async function searchNominatimPlaces(input: {
  vertical: VerticalId;
  city: string;
  limit: number;
  fetchImpl: DiscoveryFetch;
}): Promise<DiscoveredPlace[]> {
  const adapter = resolveLeadDiscoveryAdapter(input.vertical);
  const url = new URL(NOMINATIM_SEARCH_URL);
  url.searchParams.set("q", adapter.placeSearch.nominatimQuery(input.city));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("extratags", "1");
  url.searchParams.set("limit", String(Math.min(50, input.limit)));

  const response = await input.fetchImpl(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": LEAD_DISCOVERY_USER_AGENT,
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Nominatim returned HTTP ${response.status}`);
  }

  const rows = await response.json();
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) =>
      parseNominatimPlace(
        row,
        input.city,
        adapter.placeSearch.fallbackCategory,
      ),
    )
    .filter((place): place is DiscoveredPlace => place !== null)
    .slice(0, input.limit);
}

function parseGooglePlace(value: unknown, fallbackCity: string): DiscoveredPlace | null {
  const record = asRecord(value);
  if (!record) return null;
  const placeId = asString(record.id)?.replace(/^places\//, "");
  const displayName = asRecord(record.displayName);
  const name = asString(displayName?.text) ?? asString(record.displayName);
  if (!placeId || !name) return null;

  const hours = Array.isArray(
    asRecord(record.regularOpeningHours)?.weekdayDescriptions,
  )
    ? (
        asRecord(record.regularOpeningHours)?.weekdayDescriptions as unknown[]
      ).flatMap((entry) => {
        if (typeof entry !== "string" || !entry.includes(":")) return [];
        const separator = entry.indexOf(":");
        const days = entry.slice(0, separator).trim();
        const hoursText = entry.slice(separator + 1).trim();
        return days && hoursText ? [{ days, hours: hoursText }] : [];
      })
    : [];

  const types = Array.isArray(record.types)
    ? record.types.filter(
        (entry): entry is string =>
          typeof entry === "string" && !GENERIC_PLACE_TYPES.has(entry),
      )
    : [];

  return {
    name,
    websiteUrl: asString(record.websiteUri),
    phone:
      asString(record.internationalPhoneNumber) ??
      asString(record.nationalPhoneNumber),
    address: asString(record.formattedAddress),
    city: cityFromAddress(asString(record.formattedAddress), fallbackCity),
    placeId,
    provider: "google_places",
    rating: asNumber(record.rating),
    reviewCount: asInteger(record.userRatingCount),
    categories: types,
    hours,
    photoCount: Array.isArray(record.photos) ? record.photos.length : 0,
    photoNewestAt: null,
    description:
      asString(asRecord(record.editorialSummary)?.overview) ??
      asString(asRecord(record.editorialSummary)?.text),
  };
}

function parseNominatimPlace(
  value: unknown,
  fallbackCity: string,
  fallbackCategory: string,
): DiscoveredPlace | null {
  const record = asRecord(value);
  if (!record) return null;
  const osmType = asString(record.osm_type);
  const osmId = record.osm_id;
  const name = asString(record.name) ?? asString(record.display_name);
  if (!osmType || osmId === undefined || osmId === null || !name) return null;

  const address = asRecord(record.address);
  const extras = asRecord(record.extratags);
  const city =
    asString(address?.city) ??
    asString(address?.town) ??
    asString(address?.village) ??
    asString(address?.municipality) ??
    fallbackCity;
  const openingHours = asString(extras?.opening_hours);

  return {
    name,
    websiteUrl:
      asString(extras?.website) ?? asString(extras?.["contact:website"]),
    phone: asString(extras?.phone) ?? asString(extras?.["contact:phone"]),
    address: asString(record.display_name),
    city,
    placeId: `${osmType}/${String(osmId)}`,
    provider: "nominatim",
    rating: null,
    reviewCount: null,
    categories: [asString(record.type) ?? fallbackCategory].filter(Boolean),
    hours: openingHours ? [{ days: "Listed hours", hours: openingHours }] : [],
    photoCount: 0,
    photoNewestAt: null,
    description: null,
  };
}

function cityFromAddress(address: string | null, fallbackCity: string): string {
  if (!address) return fallbackCity;
  if (address.toLocaleLowerCase("en").includes(fallbackCity.toLocaleLowerCase("en"))) {
    return fallbackCity;
  }
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.at(-2) ?? fallbackCity;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asInteger(value: unknown): number | null {
  const numeric = asNumber(value);
  return numeric === null ? null : Math.max(0, Math.round(numeric));
}
