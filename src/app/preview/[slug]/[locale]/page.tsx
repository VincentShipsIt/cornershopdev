import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { SiteRenderer } from "@/components/site-renderer";
import { getSiteLocales, localizeSiteDraft } from "@/lib/site-draft";
import { liveSiteVersionId } from "@/lib/site-surface";
import {
  findPublishedSiteView,
  findSiteView,
} from "@/lib/sites";

type PageProps = {
  params: Promise<{ slug: string; locale: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const versionId = liveSiteVersionId(await headers(), slug);
  const site = versionId
    ? await findPublishedSiteView(slug, versionId)
    : await findSiteView(slug);
  if (!site) notFound();
  const liveSurface = versionId !== null;
  const locales = getSiteLocales(site.draft);
  if (!locales.includes(locale)) notFound();

  return {
    title: liveSurface
      ? site.draft.name
      : `${site.draft.name} — Private preview`,
    robots: liveSurface
      ? { index: true, follow: true }
      : { index: false, follow: false },
    alternates: {
      canonical: liveSurface
        ? locale === site.draft.defaultLocale
          ? "/"
          : `/${locale}`
        : locale === site.draft.defaultLocale
          ? `/preview/${slug}`
          : `/preview/${slug}/${locale}`,
      languages: Object.fromEntries(
        locales.map((availableLocale) => [
          availableLocale,
          liveSurface
            ? availableLocale === site.draft.defaultLocale
              ? "/"
              : `/${availableLocale}`
            : availableLocale === site.draft.defaultLocale
              ? `/preview/${slug}`
              : `/preview/${slug}/${availableLocale}`,
        ]),
      ),
    },
  };
}

export default async function LocalizedPreviewPage({ params }: PageProps) {
  const { slug, locale } = await params;
  const versionId = liveSiteVersionId(await headers(), slug);
  const site = versionId
    ? await findPublishedSiteView(slug, versionId)
    : await findSiteView(slug);
  if (!site) notFound();
  const liveSurface = versionId !== null;
  const locales = getSiteLocales(site.draft);
  if (!locales.includes(locale)) notFound();

  return (
    <SiteRenderer
      draft={localizeSiteDraft(site.draft, locale)}
      vertical={site.vertical}
      theme={site.theme}
      locale={locale}
      localeBasePath={liveSurface ? "/" : `/preview/${slug}`}
      availableLocales={locales}
      analyticsEnabled={liveSurface}
    />
  );
}
