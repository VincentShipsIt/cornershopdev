import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteRenderer } from "@/components/site-renderer";
import { getSiteLocales, localizeSiteDraft } from "@/lib/site-draft";
import { findSiteView } from "@/lib/sites";

type PageProps = {
  params: Promise<{ slug: string; locale: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const site = await findSiteView(slug);
  if (!site) notFound();
  const locales = getSiteLocales(site.draft);
  if (!locales.includes(locale)) notFound();

  return {
    title: `${site.draft.name} — Private preview`,
    robots: { index: false, follow: false },
    alternates: {
      canonical:
        locale === site.draft.defaultLocale
          ? `/preview/${slug}`
          : `/preview/${slug}/${locale}`,
      languages: Object.fromEntries(
        locales.map((availableLocale) => [
          availableLocale,
          availableLocale === site.draft.defaultLocale
            ? `/preview/${slug}`
            : `/preview/${slug}/${availableLocale}`,
        ]),
      ),
    },
  };
}

export default async function LocalizedPreviewPage({ params }: PageProps) {
  const { slug, locale } = await params;
  const site = await findSiteView(slug);
  if (!site) notFound();
  const locales = getSiteLocales(site.draft);
  if (!locales.includes(locale)) notFound();

  return (
    <SiteRenderer
      draft={localizeSiteDraft(site.draft, locale)}
      vertical={site.vertical}
      locale={locale}
      localeBasePath={`/preview/${slug}`}
      availableLocales={locales}
    />
  );
}
