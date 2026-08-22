import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { listPublishedArticles } from "@/lib/articles/public-articles";
import { liveSiteVersionId } from "@/lib/site-surface";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({}: PageProps): Promise<Metadata> {
  return {
    robots: { index: true, follow: true },
    alternates: { canonical: "/blog" },
  };
}

export default async function BlogIndexPage({ params }: PageProps) {
  const { slug } = await params;
  const requestHeaders = await headers();
  const versionId = liveSiteVersionId(requestHeaders, slug);
  // Without the proxy-attested live surface this path is a private preview;
  // articles are a published-site feature, so previews get nothing.
  if (!versionId) notFound();

  const articles = await listPublishedArticles({ slug, versionId });
  if (!articles.length) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold">Blog</h1>
      <ul className="mt-10 space-y-10">
        {articles.map((article) => (
          <li key={article.slug}>
            <Link
              href={`/blog/${article.slug}`}
              className="text-xl font-medium underline-offset-4 hover:underline"
            >
              {article.title}
            </Link>
            <p className="mt-2 opacity-75">{article.excerpt}</p>
            <time
              dateTime={article.publishedAt.toISOString()}
              className="mt-1 block text-sm opacity-60"
            >
              {article.publishedAt.toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </time>
          </li>
        ))}
      </ul>
    </main>
  );
}
