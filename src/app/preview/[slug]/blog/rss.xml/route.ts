import { headers } from "next/headers";
import { listPublishedArticles } from "@/lib/articles/public-articles";
import { liveSiteVersionId } from "@/lib/site-surface";

/**
 * RSS 2.0 feed for a site's published articles. Like the blog sitemap, it
 * only answers on a live customer surface where the proxy has attested the
 * slug; the factory host gets an empty channel rather than an error so the
 * route exists uniformly.
 */
export async function GET(): Promise<Response> {
  const requestHeaders = await headers();
  const slug = requestHeaders.get("x-cornershop-live-site-slug");
  const versionId = slug ? liveSiteVersionId(requestHeaders, slug) : null;
  const articles =
    slug && versionId
      ? await listPublishedArticles({ slug, versionId, limit: 20 })
      : [];

  const escape = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const items = articles
    .map(
      (article) =>
        `    <item>\n` +
        `      <title>${escape(article.title)}</title>\n` +
        `      <description>${escape(article.excerpt)}</description>\n` +
        `      <link>/blog/${escape(article.slug)}</link>\n` +
        `      <guid isPermaLink="false">${escape(article.slug)}</guid>\n` +
        `      <pubDate>${article.publishedAt.toUTCString()}</pubDate>\n` +
        `    </item>`,
    )
    .join("\n");

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0"><channel>\n` +
    `  <title>Blog</title>\n` +
    `  <description>Latest articles</description>\n` +
    `${items ? `\n${items}\n` : ""}` +
    `</channel></rss>\n`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
