import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Database,
  GitBranch,
  Globe2,
  Layers,
  ScanSearch,
  Sparkles,
  Store,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FACTORY_BRAND } from "@/lib/brand";
import {
  listMarketingVerticals,
  resolveVerticalConfig,
  verticalSlug,
} from "@/lib/verticals/registry";

/**
 * cornershop.dev — the factory itself, not a niche. It sells two things at once:
 * a finished website to a small business, and the machine that makes them to a
 * builder. The niche list is read from the vertical registry, so shipping a nails
 * or barber domain adds a card here with no edit to this file.
 *
 * Deliberately has no import form. A lead has to be attached to a niche, and on
 * this page nobody has chosen one yet — so the only route into the studio from
 * here goes through a niche first.
 */

const REPO_URL = "https://github.com/VincentShipsIt/cornershopdev";

export const metadata: Metadata = {
  title: "Cornershopdev — the website factory for small business",
  description:
    "One engine, one database, one deploy — and a storefront brand for every trade. Cornershopdev turns a small business's existing web presence into a finished site it can claim.",
};

const steps = [
  {
    number: "01",
    title: "A niche gets a domain",
    copy: "restofront.com for restaurants. A nails domain, a barber domain next. Each one is a config entry in the vertical registry and a DNS record — never a new codebase.",
  },
  {
    number: "02",
    title: "The factory builds the site",
    copy: "One import pipeline recovers the catalogue, contact details, imagery and existing booking tools, then renders them through that niche's own templates and vocabulary.",
  },
  {
    number: "03",
    title: "The owner claims it",
    copy: "Every lead arrives tagged with the niche it came from, into the same database and the same billing. Different storefronts, one operation behind them.",
  },
];

const platform = [
  {
    icon: Layers,
    title: "A vertical is a config, not a fork",
    copy: "Schema, providers, prompt, templates and marketing copy live in one directory per niche. Register it and the router, the CSP allow-list and this homepage pick it up.",
  },
  {
    icon: Database,
    title: "One database behind every domain",
    copy: "Leads, sites, domains and subscriptions are shared. A niche is a column, so a second trade costs a config entry rather than a second deployment to keep alive.",
  },
  {
    icon: ScanSearch,
    title: "Import over onboarding",
    copy: "The pipeline starts from what a business already published instead of an empty form. The first thing the owner sees is a finished site, not a setup wizard.",
  },
  {
    icon: GitBranch,
    title: "Open source, self-hostable",
    copy: "Next.js, Postgres and durable workflows. Clone it, register your own trade, point a domain at it and run the factory yourself.",
  },
];

export default function Home() {
  const niches = listMarketingVerticals().map((id) => {
    const { marketing } = resolveVerticalConfig(id);
    return { slug: verticalSlug(id), marketing };
  });

  return (
    <>
      <SiteHeader
        brand={FACTORY_BRAND}
        links={[
          { href: "#niches", label: "Niches" },
          { href: "#how-it-works", label: "How it works" },
          { href: "#platform", label: "The factory" },
        ]}
        createHref="#niches"
        ctaLabel="Pick a niche"
      />
      <main>
        <section className="paper-grid overflow-hidden border-b">
          <div className="mx-auto flex max-w-4xl flex-col items-center px-5 pb-20 pt-20 text-center lg:px-8 lg:pb-28 lg:pt-24">
            <Badge
              variant="secondary"
              className="mb-6 rounded-full border border-primary/15 bg-primary/8 px-3 py-1 text-primary"
            >
              <Sparkles className="size-3" />
              An open source website factory
            </Badge>
            <h1 className="font-display text-balance text-[clamp(4.2rem,8vw,7.6rem)] leading-[0.83] tracking-[-0.055em]">
              One factory. Every corner shop.
            </h1>
            <p className="mt-7 max-w-xl text-balance text-lg leading-8 text-muted-foreground">
              Restaurants, salons, barbers — every trade gets its own brand and
              its own domain. Behind all of them: one engine, one database, one
              deploy.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button
                render={<Link href="#niches" />}
                nativeButton={false}
                size="lg"
                className="h-11 rounded-xl"
              >
                Find your trade
                <ArrowRight className="size-4" />
              </Button>
              <Button
                render={
                  <a href={REPO_URL} target="_blank" rel="noreferrer noopener" />
                }
                nativeButton={false}
                size="lg"
                variant="outline"
                className="h-11 rounded-xl"
              >
                Read the source
                <ArrowUpRight className="size-3.5" />
              </Button>
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Check className="size-3.5 text-primary" /> Import, don&apos;t
                onboard
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="size-3.5 text-primary" /> A new trade is a
                config entry
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="size-3.5 text-primary" /> Self-host the whole
                thing
              </span>
            </div>
          </div>
        </section>

        <section
          id="niches"
          className="mx-auto max-w-7xl px-5 py-24 lg:px-8 lg:py-32"
        >
          <div className="flex flex-col gap-6 border-b pb-10 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                The storefronts
              </p>
              <h2 className="font-display mt-4 max-w-lg text-6xl leading-[0.92] tracking-[-0.045em]">
                Each trade sells under its own name.
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-muted-foreground">
              A restaurant should be sold a restaurant product, not a generic
              website builder. Cornershopdev stays behind the curtain.
            </p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {niches.map(({ slug, marketing }) => (
              <article
                key={slug}
                className="flex flex-col rounded-3xl border bg-card p-7"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-full border border-primary/25 bg-primary text-[11px] font-bold tracking-[-0.08em] text-primary-foreground">
                      {marketing.brand.initials}
                    </span>
                    <div>
                      <p className="font-semibold">{marketing.brand.name}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {marketing.domain ?? "domain not live yet"}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    className={
                      marketing.domain
                        ? "border border-primary/15 bg-primary/8 text-primary"
                        : ""
                    }
                  >
                    {marketing.domain ? "Live" : "In build"}
                  </Badge>
                </div>

                <p className="mt-6 text-sm font-medium">
                  For {marketing.audience}
                </p>
                <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                  {marketing.tagline}
                </p>

                <Button
                  // Launched niches link to their own domain: that is where the
                  // storefront actually lives and the URL a visitor should keep.
                  // Unlaunched ones link to the internal route, which renders the
                  // very same page from the same config.
                  render={
                    marketing.domain ? (
                      <a
                        href={`https://${marketing.domain}`}
                        target="_blank"
                        rel="noreferrer noopener"
                      />
                    ) : (
                      <Link href={`/niche/${slug}`} />
                    )
                  }
                  nativeButton={false}
                  variant="outline"
                  className="mt-8 w-full"
                >
                  Visit {marketing.brand.name}
                  {marketing.domain ? (
                    <ArrowUpRight className="size-3.5" />
                  ) : (
                    <ArrowRight className="size-4" />
                  )}
                </Button>
              </article>
            ))}

            <article className="flex flex-col justify-center rounded-3xl border border-dashed bg-transparent p-7">
              <Store className="size-5 text-primary" />
              <p className="mt-5 font-semibold">Your trade next</p>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                Dog groomers, dentists, driving schools. A vertical is one
                directory — catalogue schema, booking providers, prompt,
                templates and the copy for its own homepage.
              </p>
              <Link
                href={REPO_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-6 flex items-center gap-1.5 text-sm font-medium text-primary"
              >
                See how a vertical is registered
                <ArrowUpRight className="size-3.5" />
              </Link>
            </article>
          </div>
        </section>

        <section
          id="how-it-works"
          className="mx-auto max-w-7xl px-5 pb-24 lg:px-8 lg:pb-32"
        >
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                Many fronts. One back.
              </p>
              <h2 className="font-display mt-4 max-w-md text-6xl leading-[0.92] tracking-[-0.045em]">
                How a niche ships.
              </h2>
            </div>
            <div className="divide-y border-y">
              {steps.map((step) => (
                <div
                  key={step.number}
                  className="grid gap-3 py-7 sm:grid-cols-[64px_1fr_1.4fr] sm:items-start"
                >
                  <span className="font-mono text-xs text-primary">
                    {step.number}
                  </span>
                  <h3 className="font-medium">{step.title}</h3>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {step.copy}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="platform" className="bg-[#1d241f] text-white">
          <div className="mx-auto max-w-7xl px-5 py-24 lg:px-8 lg:py-32">
            <div className="flex flex-col gap-8 border-b border-white/15 pb-12 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#dc8d6d]">
                  What you actually get
                </p>
                <h2 className="font-display mt-4 max-w-3xl text-6xl leading-[0.9] tracking-[-0.045em] md:text-7xl">
                  Built to add the next trade cheaply.
                </h2>
              </div>
              <p className="max-w-sm text-sm leading-6 text-white/58">
                The expensive part of a website factory is the second vertical.
                Cornershopdev is shaped around making that one cheap.
              </p>
            </div>

            <div className="grid md:grid-cols-2">
              {platform.map((item, index) => (
                <article
                  key={item.title}
                  className={`min-h-64 border-white/15 p-7 md:p-10 ${
                    index % 2 === 0 ? "md:border-r" : ""
                  } ${index < 2 ? "border-b" : ""}`}
                >
                  <item.icon className="size-5 text-[#dc8d6d]" />
                  <h3 className="mt-12 text-xl font-medium">{item.title}</h3>
                  <p className="mt-3 max-w-md text-sm leading-6 text-white/55">
                    {item.copy}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="paper-grid border-t">
          <div className="mx-auto flex max-w-5xl flex-col items-center px-5 py-24 text-center lg:py-32">
            <Globe2 className="size-6 text-primary" />
            <h2 className="font-display text-balance mt-6 text-6xl leading-[0.9] tracking-[-0.05em] md:text-7xl">
              Start with the trade, not the tool.
            </h2>
            <p className="mt-6 max-w-xl text-muted-foreground">
              Pick the storefront that sells to your business. The factory
              behind it is the same either way.
            </p>
            <Button
              render={<Link href="#niches" />}
              nativeButton={false}
              size="lg"
              className="mt-9 h-11 rounded-xl"
            >
              See the niches
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t bg-[#1d241f] text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-10 text-sm text-white/55 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <span className="font-semibold text-white">Cornershopdev</span>
          <span>One factory. Every corner shop.</span>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1.5 text-white"
          >
            GitHub <ArrowUpRight className="size-3.5" />
          </a>
        </div>
      </footer>
    </>
  );
}
