import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { ArticleMarkdown } from "@/components/article-markdown";
import {
  articleCacheTagFor,
  getPublishedArticle,
  type PublishedArticle,
} from "@/lib/articles/public-articles";
import { liveSiteVersionId } from "@/lib/site-surface";

type PageProps = {
  params: Promise<{ slug: string; articleSlug: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug, articleSlug } = await params;
  const requestHeaders = await headers();
  const versionId = liveSiteVersionId(requestHeaders, slug);
  if (!versionId) return { robots: { index: false, follow: false } };
  const article = await loadCachedArticle(slug, versionId, articleSlug);
  if (!article) return { robots: { index: false, follow: false } };
  return {
    title: article.title,
    description: article.excerpt,
    robots: { index: true, follow: true },
    alternates: { canonical: `/blog/${article.slug}` },
    openGraph: {
      title: article.title,
      description: article.excerpt,
      type: "article",
      publishedTime: article.publishedAt.toISOString(),
    },
  };
}

export default async function ArticlePage({ params }: PageProps) {
  const { slug, articleSlug } = await params;
  const requestHeaders = await headers();
  const versionId = liveSiteVersionId(requestHeaders, slug);
  if (!versionId) notFound();

  const article = await loadCachedArticle(slug, versionId, articleSlug);
  if (!article) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.excerpt,
    datePublished: article.publishedAt.toISOString(),
    dateModified: article.publishedAt.toISOString(),
    inLanguage: article.locale,
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article>
        <header>
          <h1 className="text-3xl font-semibold">{article.title}</h1>
          <time
            dateTime={article.publishedAt.toISOString()}
            className="mt-2 block text-sm opacity-60"
          >
            {article.publishedAt.toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </time>
        </header>
        <div className="mt-8">
          <ArticleMarkdown markdown={article.bodyMarkdown} />
        </div>
      </article>
      <p className="mt-12">
        <Link href="/" className="underline underline-offset-4">
          Back to the site
        </Link>
      </p>
    </main>
  );
}

/** Tag-invalidated mirror of the blog index cache; see that page's note. */
function loadCachedArticle(
  slug: string,
  versionId: string,
  articleSlug: string,
): Promise<PublishedArticle | null> {
  const cached = unstable_cache(
    () => getPublishedArticle({ slug, versionId, articleSlug }),
    ["published-article", slug, articleSlug],
    {
      revalidate: 30,
      tags: [articleCacheTagFor(slug)],
    },
  );
  return cached();
}
