import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ShieldCheck,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { fullBrandFontVariables } from "@/components/fonts/full-brand-font-scope";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { restaurantThemeGallerySurface } from "@/lib/theme-gallery-surface";
import { listRestaurantThemeManifests } from "@/lib/site-themes/restaurant/registry";
import { resolveRequestOrigin } from "@/lib/verticals/request-site";
import styles from "./theme-gallery.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const surface = restaurantThemeGallerySurface(await resolveRequestOrigin());
  return {
    title: { absolute: `Restaurant themes | ${surface.brand.name}` },
    description:
      "Explore three original restaurant website themes built around reservations, ordering and after-dark hospitality.",
    alternates: {
      canonical: `${surface.canonicalOrigin}/themes/restaurant`,
    },
  };
}

export default async function RestaurantThemeGalleryPage() {
  const manifests = listRestaurantThemeManifests();
  const surface = restaurantThemeGallerySurface(await resolveRequestOrigin());

  return (
    <div className={surface.inverse ? styles.factorySurface : undefined}>
      <SiteHeader
        brand={{ ...surface.brand, href: "/" }}
        inverse={surface.inverse}
        links={[
          { href: "/", label: surface.brand.name },
          { href: "#themes", label: "Themes" },
          { href: surface.pricingHref, label: "Pricing" },
        ]}
        createHref="/create?vertical=restaurant"
        fontVariables={fullBrandFontVariables}
      />
      <main>
        <section
          className={`${surface.inverse ? styles.factoryGrid : "paper-grid"} border-b`}
        >
          <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
            <Badge
              variant="secondary"
              className="rounded-full border border-primary/15 bg-primary/8 text-primary"
            >
              Three service models. Three original systems.
            </Badge>
            <div className="mt-7 grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
              <h1 className="font-display max-w-4xl text-[clamp(4.2rem,9vw,8rem)] leading-[0.82] tracking-[-0.06em]">
                The restaurant decides the theme.
              </h1>
              <div className="max-w-xl lg:justify-self-end">
                <p className="text-lg leading-8 text-muted-foreground">
                  {surface.brand.name} matches service model, customer intent,
                  menu shape, brand character and photography—not cuisine
                  stereotypes.
                </p>
                <div className="mt-6 flex items-start gap-3 rounded-2xl border bg-card p-4 text-sm leading-6 text-muted-foreground">
                  <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
                  AI chooses only registered themes and validated tokens. It
                  never writes website code, CSS, font URLs or page structures.
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="themes"
          className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-24"
        >
          <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                Theme library
              </p>
              <h2 className="font-display mt-3 text-5xl leading-[0.9] tracking-[-0.045em] md:text-6xl">
                Compare the starting points.
              </h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">
              Open any theme as a complete fictional restaurant website before
              you build your own preview.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {manifests.map((manifest, index) => {
              const detailHref = `/themes/restaurant/${manifest.id}`;
              const previewHref = `${detailHref}/preview`;

              return (
                <article
                  key={manifest.id}
                  className="flex min-w-0 flex-col overflow-hidden rounded-3xl border bg-card shadow-sm"
                >
                  <div className={styles.previewViewport}>
                    <iframe
                      src={previewHref}
                      title={`${manifest.name} restaurant website preview`}
                      tabIndex={-1}
                      aria-hidden="true"
                      loading="lazy"
                      className={styles.previewFrame}
                    />
                    <div className={styles.previewShade} />
                    <span className={styles.previewDisclosure}>
                      Fictional preview
                    </span>
                    <Link
                      href={previewHref}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open the full ${manifest.name} website preview`}
                      className={styles.previewLink}
                    >
                      <span>
                        Open full preview
                        <ArrowUpRight className="size-4" />
                      </span>
                    </Link>
                  </div>

                  <div className="flex flex-1 flex-col p-6">
                    <p className="font-mono text-[11px] text-primary">
                      0{index + 1} · {manifest.id} · v
                      {manifest.rendererVersion}
                    </p>
                    <h3 className="font-display mt-3 text-4xl leading-[0.9] tracking-[-0.04em]">
                      {manifest.name}
                    </h3>
                    <p className="mt-4 text-sm leading-6 text-muted-foreground">
                      {manifest.description}
                    </p>

                    <ul className="mt-5 space-y-2">
                      {manifest.bestFor.slice(0, 2).map((fit) => (
                        <li
                          key={fit}
                          className="flex items-start gap-2 text-xs leading-5"
                        >
                          <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                          {fit}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-auto grid grid-cols-2 gap-2 pt-6">
                      <Button
                        render={<Link href={detailHref} />}
                        nativeButton={false}
                        variant="outline"
                        className="min-w-0"
                      >
                        Theme details
                      </Button>
                      <Button
                        render={
                          <Link
                            href={previewHref}
                            target="_blank"
                            rel="noreferrer"
                          />
                        }
                        nativeButton={false}
                        className="min-w-0"
                      >
                        Full preview
                        <ArrowUpRight className="size-4" />
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section
          className={`border-t text-white ${
            surface.inverse ? "bg-[#080808]" : "bg-[#1d241f]"
          }`}
        >
          <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-16 md:flex-row md:items-end md:justify-between lg:px-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#dc8d6d]">
                Matching, not roulette
              </p>
              <h2 className="font-display mt-3 max-w-3xl text-5xl leading-[0.9] tracking-[-0.045em] md:text-6xl">
                Start from the restaurant. Keep the choice bounded.
              </h2>
            </div>
            <Button
              render={<Link href="/create?vertical=restaurant" />}
              nativeButton={false}
              variant="secondary"
              size="lg"
            >
              Build a restaurant preview
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
