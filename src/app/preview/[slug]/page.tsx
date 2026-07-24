import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteRenderer } from "@/components/site-renderer";
import { getSiteLocales } from "@/lib/site-draft";
import { findSiteView } from "@/lib/sites";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const site = await findSiteView(slug);
  if (!site) notFound();
  const locales = getSiteLocales(site.draft);
  return {
    title: `${site.draft.name} — Private preview`,
    robots: { index: false, follow: false },
    alternates: {
      canonical: `/preview/${slug}`,
      languages: Object.fromEntries(
        locales.map((locale) => [
          locale,
          locale === site.draft.defaultLocale
            ? `/preview/${slug}`
            : `/preview/${slug}/${locale}`,
        ]),
      ),
    },
  };
}

export default async function PreviewPage({ params }: PageProps) {
  const { slug } = await params;
  const site = await findSiteView(slug);
  if (!site) notFound();
  return (
    <SiteRenderer
      draft={site.draft}
      vertical={site.vertical}
      locale={site.draft.defaultLocale}
      localeBasePath={`/preview/${slug}`}
      availableLocales={getSiteLocales(site.draft)}
    />
  );
}
