import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import {
  listPublishedArticles,
  type PublishedArticle,
} from "@/lib/articles/public-articles";
import { liveSiteVersionId } from "@/lib/site-surface";

/**
 * Per-site blog sitemap fragment. On a customer host or platform subdomain
 * the proxy attests the live slug/version, and this lists that site's
 * published articles. On the factory host there is no attested slug, so it
 * returns an empty list — the root `src/app/sitemap.ts` owns the factory's
 * own entries.
 */
export default async function blogSitemap(): Promise<MetadataRoute.Sitemap> {
  const requestHeaders = await headers();
  const slug = requestHeaders.get("x-cornershop-live-site-slug");
  const versionId = slug ? liveSiteVersionId(requestHeaders, slug) : null;
  if (!slug || !versionId) return [];

  const articles: PublishedArticle[] = await listPublishedArticles({
    slug,
    versionId,
    limit: 100,
  });
  return articles.map((article) => ({
    url: `/blog/${article.slug}`,
    lastModified: article.publishedAt,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));
}
