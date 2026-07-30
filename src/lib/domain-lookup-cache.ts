import type { PublishedDomainRecord } from "@/lib/domain-routing";

type CacheEntry = {
  expiresAt: number;
  records: PublishedDomainRecord[];
};

const DEFAULT_TTL_MS = 5_000;
const MAX_ENTRIES = 512;

/**
 * Short-lived process cache for custom-domain hostname → site resolution.
 * Proxy hits the same hot hostnames repeatedly; five seconds cuts DB QPS without
 * making TLS/domain detach feel sticky for long.
 */
const cache = new Map<string, CacheEntry>();

function cacheKey(hostnames: string[]): string {
  return hostnames.slice().sort().join("|");
}

export function getCachedDomainRecords(
  hostnames: string[],
): PublishedDomainRecord[] | null {
  const key = cacheKey(hostnames);
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  // Refresh insertion order for a simple LRU-ish eviction.
  cache.delete(key);
  cache.set(key, entry);
  return entry.records;
}

export function setCachedDomainRecords(
  hostnames: string[],
  records: PublishedDomainRecord[],
  ttlMs = DEFAULT_TTL_MS,
): void {
  const key = cacheKey(hostnames);
  cache.set(key, { expiresAt: Date.now() + ttlMs, records });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export function clearDomainLookupCache(): void {
  cache.clear();
}
