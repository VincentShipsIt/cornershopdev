import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  X,
} from "lucide-react";
import { RestaurantThemeRenderer } from "@/components/restaurant-themes/restaurant-theme-renderer";
import { SiteHeader } from "@/components/site-header";
import { fullBrandFontVariables } from "@/components/fonts/full-brand-font-scope";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { restaurantThemeGallerySurface } from "@/lib/theme-gallery-surface";
import {
  restaurantThemeIdSchema,
  type RestaurantThemeId,
} from "@/lib/site-themes/restaurant/contracts";
import { getRestaurantThemeFixture } from "@/lib/site-themes/restaurant/fixtures";
import {
  getRestaurantThemeManifest,
  listRestaurantThemeManifests,
} from "@/lib/site-themes/restaurant/registry";
import { parseRestaurantThemeSelection } from "@/lib/site-themes/restaurant/selection";
import { resolveRequestOrigin } from "@/lib/verticals/request-site";
import styles from "../theme-gallery.module.css";

export const dynamicParams = false;

export function generateStaticParams() {
  return listRestaurantThemeManifests().map(({ id }) => ({ themeId: id }));
}

function parseThemeId(value: string): RestaurantThemeId | null {
  const parsed = restaurantThemeIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ themeId: string }>;
}): Promise<Metadata> {
  const id = parseThemeId((await params).themeId);
  if (!id) return {};
  const manifest = getRestaurantThemeManifest(id);
  const surface = restaurantThemeGallerySurface(await resolveRequestOrigin());
  return {
    title: { absolute: `${manifest.name} theme | ${surface.brand.name}` },
    description: manifest.description,
    alternates: {
      canonical: `${surface.canonicalOrigin}/themes/restaurant/${manifest.id}`,
    },
  };
}

export default async function RestaurantThemeDetailPage({
  params,
}: {
  params: Promise<{ themeId: string }>;
}) {
  const id = parseThemeId((await params).themeId);
  if (!id) notFound();

  const manifest = getRestaurantThemeManifest(id);
  const fixture = getRestaurantThemeFixture(id);
  const selection = parseRestaurantThemeSelection(
    fixture.attributes.themeSelection,
  );
  if (!selection) notFound();
  const surface = restaurantThemeGallerySurface(await resolveRequestOrigin());

  return (
    <div className={surface.inverse ? styles.factorySurface : undefined}>
      <SiteHeader
        brand={{ ...surface.brand, href: "/" }}
        inverse={surface.inverse}
        links={[
          { href: "/themes/restaurant", label: "All themes" },
          { href: "#fit", label: "Fit" },
          { href: "#preview", label: "Preview" },
        ]}
        createHref="/create?vertical=restaurant"
        fontVariables={fullBrandFontVariables}
      />
      <main>
        <section
          className={`${surface.inverse ? styles.factoryGrid : "paper-grid"} border-b`}
        >
          <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-24">
            <Link
              href="/themes/restaurant"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
              All restaurant themes
            </Link>
            <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_0.8fr] lg:items-end">
              <div>
                <p className="font-mono text-xs text-primary">
                  {manifest.id} · renderer v{manifest.rendererVersion}
                </p>
                <h1 className="font-display mt-4 text-[clamp(4.5rem,10vw,8.5rem)] leading-[0.8] tracking-[-0.06em]">
                  {manifest.name}
                </h1>
              </div>
              <div className="max-w-xl lg:justify-self-end">
                <p className="text-lg leading-8 text-muted-foreground">
                  {manifest.description}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    {manifest.experience.primaryIntent}-led
                  </Badge>
                  <Badge variant="secondary">
                    {manifest.experience.menuExperience} menu
                  </Badge>
                  <Badge variant="outline">
                    immutable renderer v{manifest.rendererVersion}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="fit"
          className="mx-auto grid max-w-7xl gap-8 px-5 py-14 lg:grid-cols-2 lg:px-8 lg:py-20"
        >
          <div className="rounded-3xl border bg-card p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Best fit
            </p>
            <ul className="mt-6 space-y-4">
              {manifest.bestFor.map((fit) => (
                <li key={fit} className="flex items-start gap-3">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span className="text-sm leading-6">{fit}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl border bg-card p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Avoid when
            </p>
            <ul className="mt-6 space-y-4">
              {manifest.avoidWhen.map((condition) => (
                <li key={condition} className="flex items-start gap-3">
                  <X className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="text-sm leading-6">{condition}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="preview" className="bg-[#2b2b2b] px-3 py-10 md:px-6">
          <div className="mx-auto mb-5 flex max-w-[1450px] flex-col gap-3 text-white sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/60">
                Live renderer preview
              </p>
              <p className="mt-1 text-sm text-white/80">
                Fictional restaurant fixture · AI-created preview image
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Badge className="w-fit bg-white/10 text-white">
                No third-party theme code or assets
              </Badge>
              <Button
                render={
                  <Link
                    href={`/themes/restaurant/${manifest.id}/preview`}
                    target="_blank"
                    rel="noreferrer"
                  />
                }
                nativeButton={false}
                variant="secondary"
              >
                Open full website preview
                <ArrowUpRight className="size-4" />
              </Button>
            </div>
          </div>
          <div className="mx-auto max-w-[1450px] rounded-[1.8rem] border border-white/15 p-2 md:p-3">
            <RestaurantThemeRenderer
              draft={fixture}
              selection={selection}
              embedded
            />
          </div>
        </section>

        <section className="border-t">
          <div className="mx-auto flex max-w-7xl flex-col gap-7 px-5 py-16 md:flex-row md:items-center md:justify-between lg:px-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                Automatic by default
              </p>
              <h2 className="font-display mt-3 max-w-3xl text-5xl leading-[0.9] tracking-[-0.045em]">
                Let the restaurant signals choose the starting point.
              </h2>
            </div>
            <Button
              render={<Link href="/create?vertical=restaurant" />}
              nativeButton={false}
              size="lg"
            >
              Build a preview
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
