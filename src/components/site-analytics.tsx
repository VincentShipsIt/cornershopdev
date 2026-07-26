"use client";

import { useEffect } from "react";
import {
  getAnalyticsVisitId,
  markAnalyticsViewSent,
  sendAnalyticsEvent,
} from "@/lib/analytics-browser";

export function SiteAnalytics({ siteSlug }: { siteSlug: string }) {
  useEffect(() => {
    if (navigator.webdriver) return;
    const visitId = getAnalyticsVisitId(siteSlug);
    if (!visitId) return;

    if (markAnalyticsViewSent(siteSlug)) {
      sendAnalyticsEvent("SITE_VIEW", visitId);
    }

    const captureCta = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest("[data-analytics-cta]")) return;
      sendAnalyticsEvent("CTA_CLICK", visitId);
    };
    document.addEventListener("click", captureCta, { capture: true });
    return () => document.removeEventListener("click", captureCta, true);
  }, [siteSlug]);

  return null;
}
