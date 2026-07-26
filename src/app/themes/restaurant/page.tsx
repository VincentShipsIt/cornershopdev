import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { RestaurantThemeRenderer } from "@/components/restaurant-themes/restaurant-theme-renderer";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { restaurantThemeFixtures } from "@/lib/site-themes/restaurant/fixtures";
import { listRestaurantThemeManifests } from "@/lib/site-themes/restaurant/registry";
import { parseRestaurantThemeSelection } from "@/lib/site-themes/restaurant/selection";
import { restaurantMarketing } from "@/lib/verticals/restaurant/marketing";

export const metadata: Metadata = {
  title: { absolute: "Restaurant themes | Restofront" },
  description:
    "Explore three original restaurant website themes built around reservations, ordering and after-dark hospitality.",
  alternates: {
    canonical: "https://restofront.com/themes/restaurant",
  },
};

export default function RestaurantThemeGalleryPage() {
  const manifests = listRestaurantThemeManifests();

  return (
    <>
      <SiteHeader
        brand={{ ...restaurantMarketing.brand, href: "/" }}
        links={[
          { href: "/", label: "Restofront" },
          { href: "#themes", label: "Themes" },
          { href: "/#pricing", label: "Pricing" },
        ]}
        createHref="/create?vertical=restaurant"
      />
      <main>
        <section className="paper-grid border-b">
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
                  Restofront matches service model, customer intent, menu shape,
                  brand character and photography—not cuisine stereotypes.
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
          className="mx-auto max-w-[1500px] space-y-24 px-4 py-16 md:px-6 lg:py-24"
        >
          {manifests.map((manifest, index) => {
            const fixture = restaurantThemeFixtures[manifest.id];
            const selection = parseRestaurantThemeSelection(
              fixture.attributes.themeSelection,
            );
            if (!selection) return null;

            return (
              <article key={manifest.id}>
                <div className="mx-auto mb-7 grid max-w-7xl gap-7 px-1 lg:grid-cols-[0.7fr_1.3fr] lg:items-end">
                  <div>
                    <p className="font-mono text-xs text-primary">
                      0{index + 1} · {manifest.id} · v
                      {manifest.rendererVersion}
                    </p>
                    <h2 className="font-display mt-3 text-5xl leading-[0.9] tracking-[-0.045em] md:text-6xl">
                      {manifest.name}
                    </h2>
                  </div>
                  <div className="lg:justify-self-end">
                    <p className="max-w-xl text-sm leading-7 text-muted-foreground">
                      {manifest.description}
                    </p>
                    <ul className="mt-4 flex flex-wrap gap-2">
                      {manifest.bestFor.slice(0, 3).map((fit) => (
                        <li
                          key={fit}
                          className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs"
                        >
                          <Check className="size-3 text-primary" />
                          {fit}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="relative mx-auto max-w-[1450px] rounded-[1.8rem] border bg-[#2b2b2b] p-2 shadow-2xl md:p-3">
                  <div className="absolute left-5 top-5 z-30 rounded-full border border-white/20 bg-black/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur">
                    Fictional preview · AI-created image
                  </div>
                  <RestaurantThemeRenderer
                    draft={fixture}
                    selection={selection}
                    embedded
                  />
                </div>

                <div className="mx-auto mt-6 flex max-w-7xl justify-end">
                  <Button
                    render={
                      <Link href={`/themes/restaurant/${manifest.id}`} />
                    }
                    nativeButton={false}
                    variant="outline"
                  >
                    Inspect this theme
                    <ArrowRight className="size-4" />
                  </Button>
                </div>
              </article>
            );
          })}
        </section>

        <section className="border-t bg-[#1d241f] text-white">
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
    </>
  );
}
