import "server-only";
import { getDb } from "@/lib/db";
import { previewCacheTagFor } from "@/lib/site-surface";

/**
 * Public article reads for customer surfaces.
 *
 * Every function here requires BOTH the proxy-attested live-site slug and
 * version id before it returns content, mirroring how the site renderer
 * gates published snapshots: a factory-hosted `/preview/<slug>/blog` request
 * has no attested version and gets nothing, so drafts can never leak onto a
 * public path through this module.
 */

export type PublishedArticle = {
  slug: string;
  title: string;
  excerpt: string;
  bodyMarkdown: string;
  locale: string;
  publishedAt: Date;
};

export async function listPublishedArticles(input: {
  slug: string;
  versionId: string | null;
  locale?: string;
  limit?: number;
}): Promise<PublishedArticle[]> {
  if (!input.versionId) return [];
  const db = getDb();
  const rows = await db.article.findMany({
    where: {
      site: { slug: input.slug },
      status: "PUBLISHED",
      publishedAt: { not: null },
      ...(input.locale ? { locale: input.locale } : {}),
    },
    orderBy: { publishedAt: "desc" },
    take: Math.min(Math.max(input.limit ?? 50, 1), 100),
    select: {
      slug: true,
      title: true,
      excerpt: true,
      bodyMarkdown: true,
      locale: true,
      publishedAt: true,
    },
  });
  return rows.flatMap((row) =>
    row.publishedAt
      ? [
          {
            slug: row.slug,
            title: row.title,
            excerpt: row.excerpt,
            bodyMarkdown: row.bodyMarkdown,
            locale: row.locale,
            publishedAt: row.publishedAt,
          },
        ]
      : [],
  );
}

export async function getPublishedArticle(input: {
  slug: string;
  versionId: string | null;
  articleSlug: string;
}): Promise<PublishedArticle | null> {
  if (!input.versionId) return null;
  const db = getDb();
  const row = await db.article.findFirst({
    where: {
      site: { slug: input.slug },
      slug: input.articleSlug,
      status: "PUBLISHED",
      publishedAt: { not: null },
    },
    select: {
      slug: true,
      title: true,
      excerpt: true,
      bodyMarkdown: true,
      locale: true,
      publishedAt: true,
    },
  });
  if (!row?.publishedAt) return null;
  return {
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    bodyMarkdown: row.bodyMarkdown,
    locale: row.locale,
    publishedAt: row.publishedAt,
  };
}

/**
 * Cache tag for a site's published-article surfaces. Publish/unpublish
 * invalidates it with `{ expire: 0 }`, mirroring how
 * `previewCacheTagFor` busts the live site snapshot.
 */
export function articleCacheTagFor(slug: string): string {
  return `${previewCacheTagFor(slug)}:articles`;
}
