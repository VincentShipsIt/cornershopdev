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
  executedQueries: ExecutedPlaceQuery[];
};

export type ExecutedPlaceQuery = {
  provider: LeadDiscoveryProvider;
  query: string;
};

const GOOGLE_TEXT_SEARCH_URL =
  "https://places.googleapis.com/v1/places:searchText";
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
  nominatimBaseUrl?: string | null;
  fetchImpl?: DiscoveryFetch;
}): Promise<PlaceDiscoveryResult> {
  const vertical = input.vertical ?? Vertical.RESTAURANT;
  const fetchImpl = input.fetchImpl ?? fetch;
  const city = input.city.trim();
  const limit = Math.min(100, Math.max(1, input.limit));
  const apiKey = input.googlePlacesApiKey?.trim() || null;
  const nominatimBaseUrl = approvedNominatimBaseUrl(input.nominatimBaseUrl);
  const executedQueries: ExecutedPlaceQuery[] = [];

  if (apiKey) {
    let googlePlaces: DiscoveredPlace[] = [];
    let googleFailure: unknown = null;
    try {
      googlePlaces = await searchGooglePlaces({
        vertical,
        city,
        limit,
        apiKey,
        fetchImpl,
        onQuery: (query) =>
          executedQueries.push({ provider: "google_places", query }),
      });
    } catch (error) {
      googleFailure = error;
    }
    if (googlePlaces.length > 0) {
      return {
        places: googlePlaces,
        provider: "google_places",
        fallbackReason: null,
        executedQueries,
      };
    }
    if (!nominatimBaseUrl) {
      if (googleFailure) throw googleFailure;
      throw new Error(
        `Google Places returned no ${resolveVerticalConfig(vertical).marketing.audience} and no approved non-public fallback is configured`,
      );
    }
    return {
      places: await searchNominatimPlaces({
        vertical,
        city,
        limit,
        baseUrl: nominatimBaseUrl,
        fetchImpl,
        onQuery: (query) =>
          executedQueries.push({ provider: "nominatim", query }),
      }),
      provider: "nominatim",
      fallbackReason: googleFailure
        ? googleFailure instanceof Error
          ? googleFailure.message
          : "Google Places request failed"
        : `Google Places returned no ${resolveVerticalConfig(vertical).marketing.audience}`,
      executedQueries,
    };
  }

  if (!nominatimBaseUrl) throw discoveryProviderRequired();

  return {
    places: await searchNominatimPlaces({
      vertical,
      city,
      limit,
      baseUrl: nominatimBaseUrl,
      fetchImpl,
      onQuery: (query) =>
        executedQueries.push({ provider: "nominatim", query }),
    }),
    provider: "nominatim",
    fallbackReason: null,
    executedQueries,
  };
}

export async function searchGooglePlaces(input: {
  vertical: VerticalId;
  city: string;
  limit: number;
  apiKey: string;
  fetchImpl: DiscoveryFetch;
  onQuery?: (query: string) => void;
}): Promise<DiscoveredPlace[]> {
  const adapter = resolveLeadDiscoveryAdapter(input.vertical);
  const queries = adapter.placeSearch.googleQueries?.(input.city) ?? [
    {
      query: adapter.placeSearch.googleQuery(input.city),
      includedType: adapter.placeSearch.googleIncludedType,
    },
  ];
  const batches: DiscoveredPlace[][] = [];

  for (const query of queries) {
    input.onQuery?.(query.query);
    const queryPlaces = new Map<string, DiscoveredPlace>();
    let pageToken: string | null = null;
    do {
      const body: Record<string, unknown> = {
        textQuery: query.query,
        pageSize: Math.min(20, input.limit),
        languageCode: "en",
      };
      if (query.includedType) body.includedType = query.includedType;
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
        if (place) mergeDiscoveredPlace(queryPlaces, place);
      }

      pageToken = rows.length > 0 ? asString(payload?.nextPageToken) : null;
    } while (pageToken && queryPlaces.size < input.limit);
    batches.push([...queryPlaces.values()]);
  }

  return selectFairPlaces(batches, input.limit);
}

export async function searchNominatimPlaces(input: {
  vertical: VerticalId;
  city: string;
  limit: number;
  baseUrl: URL;
  fetchImpl: DiscoveryFetch;
  onQuery?: (query: string) => void;
}): Promise<DiscoveredPlace[]> {
  const adapter = resolveLeadDiscoveryAdapter(input.vertical);
  const queries = adapter.placeSearch.nominatimQueries?.(input.city) ?? [
    {
      query: adapter.placeSearch.nominatimQuery(input.city),
      fallbackCategory: adapter.placeSearch.fallbackCategory,
    },
  ];
  const batches: DiscoveredPlace[][] = [];
  for (const query of queries) {
    input.onQuery?.(query.query);
    const url = new URL(input.baseUrl);
    url.searchParams.set("q", query.query);
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
    if (!Array.isArray(rows)) {
      batches.push([]);
      continue;
    }
    const queryPlaces = new Map<string, DiscoveredPlace>();
    for (const row of rows) {
      const place = parseNominatimPlace(
        row,
        input.city,
        query.fallbackCategory,
      );
      if (place) mergeDiscoveredPlace(queryPlaces, place);
    }
    batches.push([...queryPlaces.values()]);
  }
  return selectFairPlaces(batches, input.limit);
}

function selectFairPlaces(
  batches: DiscoveredPlace[][],
  limit: number,
): DiscoveredPlace[] {
  const canonical = new Map<string, DiscoveredPlace>();
  for (const batch of batches) {
    for (const place of batch) mergeDiscoveredPlace(canonical, place);
  }

  const selectedIds = new Set<string>();
  const selected: DiscoveredPlace[] = [];
  for (let index = 0; selected.length < limit; index += 1) {
    let foundCandidate = false;
    for (const batch of batches) {
      const place = batch[index];
      if (!place) continue;
      foundCandidate = true;
      if (selectedIds.has(place.placeId)) continue;
      selectedIds.add(place.placeId);
      selected.push(canonical.get(place.placeId) ?? place);
      if (selected.length === limit) break;
    }
    if (!foundCandidate) break;
  }
  return selected;
}

export function approvedNominatimBaseUrl(
  rawUrl: string | null | undefined,
): URL | null {
  if (!rawUrl?.trim()) return null;
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      hostname === "nominatim.openstreetmap.org" ||
      hostname.endsWith(".nominatim.openstreetmap.org")
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function discoveryProviderRequired(): Error {
  return new Error(
    "Lead discovery requires GOOGLE_PLACES_API_KEY or an approved non-public LEAD_DISCOVERY_NOMINATIM_BASE_URL",
  );
}

function mergeDiscoveredPlace(
  places: Map<string, DiscoveredPlace>,
  incoming: DiscoveredPlace,
): void {
  const existing = places.get(incoming.placeId);
  places.set(
    incoming.placeId,
    existing
      ? {
          ...existing,
          categories: [
            ...new Set([...existing.categories, ...incoming.categories]),
          ],
        }
      : incoming,
  );
}

function parseGooglePlace(
  value: unknown,
  fallbackCity: string,
): DiscoveredPlace | null {
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
  if (
    address
      .toLocaleLowerCase("en")
      .includes(fallbackCity.toLocaleLowerCase("en"))
  ) {
    return fallbackCity;
  }
  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
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
