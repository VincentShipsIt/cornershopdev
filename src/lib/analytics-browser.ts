const VISIT_KEY_PREFIX = "cornershopdev:analytics:visit:";
const VIEW_KEY_PREFIX = "cornershopdev:analytics:view:";
const fallbackVisits = new Map<string, string>();

export type PublicAnalyticsEventType = "SITE_VIEW" | "CTA_CLICK";

export function getAnalyticsVisitId(siteSlug: string): string | null {
  if (typeof window === "undefined" || !globalThis.crypto?.randomUUID) {
    return null;
  }

  const key = `${VISIT_KEY_PREFIX}${siteSlug}`;
  try {
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const created = globalThis.crypto.randomUUID();
    window.sessionStorage.setItem(key, created);
    return created;
  } catch {
    const existing = fallbackVisits.get(key);
    if (existing) return existing;
    const created = globalThis.crypto.randomUUID();
    fallbackVisits.set(key, created);
    return created;
  }
}

export function markAnalyticsViewSent(siteSlug: string): boolean {
  if (typeof window === "undefined") return false;
  const key = `${VIEW_KEY_PREFIX}${siteSlug}`;
  try {
    if (window.sessionStorage.getItem(key)) return false;
    window.sessionStorage.setItem(key, "1");
    return true;
  } catch {
    return true;
  }
}

export function sendAnalyticsEvent(
  type: PublicAnalyticsEventType,
  visitId: string,
): void {
  const payload = JSON.stringify({
    id: globalThis.crypto.randomUUID(),
    visitId,
    type,
  });

  try {
    if (
      navigator.sendBeacon(
        "/api/analytics/events",
        new Blob([payload], { type: "application/json" }),
      )
    ) {
      return;
    }
  } catch {
    // The keepalive fallback below has the same fire-and-forget semantics.
  }

  void fetch("/api/analytics/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    credentials: "omit",
    keepalive: true,
  }).catch(() => undefined);
}
