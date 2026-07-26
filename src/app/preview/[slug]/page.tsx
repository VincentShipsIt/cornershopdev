import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { SiteRenderer } from "@/components/site-renderer";
import { getSiteLocales } from "@/lib/site-draft";
import { isLiveSiteSurface } from "@/lib/site-surface";
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
  const liveSurface = isLiveSiteSurface(await headers(), slug);
  return (
    <SiteRenderer
      draft={site.draft}
      vertical={site.vertical}
      locale={site.draft.defaultLocale}
      localeBasePath={liveSurface ? "/" : `/preview/${slug}`}
      availableLocales={getSiteLocales(site.draft)}
      analyticsEnabled={liveSurface}
    />
  );
}
