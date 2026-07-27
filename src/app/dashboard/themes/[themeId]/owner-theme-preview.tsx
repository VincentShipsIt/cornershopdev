import { Vertical } from "@/generated/prisma/enums";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteRenderer } from "@/components/site-renderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSiteLocales, localizeSiteDraft } from "@/lib/site-draft";
import {
  restaurantDesignProfileSchema,
  restaurantThemeIdSchema,
} from "@/lib/site-themes/restaurant/contracts";
import { selectOwnerRestaurantTheme } from "@/lib/site-themes/restaurant/selection";
import { getSiteAccess } from "@/lib/authorization";
import { getCurrentSession } from "@/lib/current-session";
import { findSiteView } from "@/lib/sites";

export async function OwnerThemePreview({
  themeId,
  locale,
}: {
  themeId: string;
  locale?: string;
}) {
  const parsedThemeId = restaurantThemeIdSchema.safeParse(themeId);
  if (!parsedThemeId.success) notFound();

  const session = await getCurrentSession();
  if (!session?.siteSlug) redirect("/sign-in");
  const access = await getSiteAccess(session.siteSlug);
  if (!access.ok) redirect("/sign-in");
  if (access.site.vertical !== Vertical.RESTAURANT) notFound();

  const site = await findSiteView(access.site.slug);
  if (!site) notFound();
  const profile = restaurantDesignProfileSchema.safeParse(
    site.draft.attributes.designProfile,
  ).data;
  const selection = selectOwnerRestaurantTheme(
    profile,
    parsedThemeId.data,
  );
  const previewDraft = {
    ...site.draft,
    attributes: {
      ...site.draft.attributes,
      themeSelection: selection,
    },
  };
  const locales = getSiteLocales(previewDraft);
  const activeLocale = locale ?? previewDraft.defaultLocale;
  if (!locales.includes(activeLocale)) notFound();

  return (
    <main className="min-h-screen bg-[#2b2b2b]">
      <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 border-b border-white/15 bg-[#202020]/95 px-4 py-3 text-white backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <Badge className="bg-amber-300 text-black">Preview only</Badge>
          <p className="text-sm text-white/75">
            This theme has not been saved or published.
          </p>
        </div>
        <Button
          render={<Link href="/dashboard" />}
          nativeButton={false}
          variant="secondary"
          size="sm"
        >
          Back to Design
        </Button>
      </div>
      <div className="p-2 md:p-4">
        <SiteRenderer
          draft={localizeSiteDraft(previewDraft, activeLocale)}
          vertical={site.vertical}
          theme={{
            id: selection.themeId,
            version: `restaurant-renderer-v${selection.rendererVersion}`,
            selection,
          }}
          locale={activeLocale}
          localeBasePath={`/dashboard/themes/${selection.themeId}`}
          availableLocales={locales}
        />
      </div>
    </main>
  );
}
