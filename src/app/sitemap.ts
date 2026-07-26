import type { MetadataRoute } from "next";
import { resolveRequestOrigin } from "@/lib/verticals/request-site";

/**
 * Every domain the app answers on serves this file, so the origin is read from
 * the request rather than hardcoded: a crawler on restofront.com must be handed
 * restofront.com's sitemap, not the factory's.
 *
 * Only the marketing root is listed. Generated customer sites live behind their
 * own domains, and every other route here is noindex.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await resolveRequestOrigin();
  const routes: MetadataRoute.Sitemap = [
    {
      url: origin,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
  if (origin === "https://restofront.com") {
    routes.push({
      url: `${origin}/themes/restaurant`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    });
  }
  return routes;
}
