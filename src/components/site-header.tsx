import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import type { BrandIdentity } from "@/lib/brand";
import { cn } from "@/lib/utils";

// `SiteHeaderMobileNav` wraps `@base-ui/react/dialog` (the `Sheet`
// primitive) — the single biggest client-only dependency in the header, and
// one only needed once a visitor taps the hamburger trigger. Code-splitting
// it into its own chunk keeps that portal/focus-trap machinery off the
// critical hydration path for every route that renders `SiteHeader` (the
// homepage and every niche storefront). `ssr: true` (the default) still
// renders it server-side, so there's no layout shift or no-JS regression —
// only the module graph is split.
const SiteHeaderMobileNav = dynamic(() =>
  import("@/components/site-header-mobile-nav").then(
    (mod) => mod.SiteHeaderMobileNav,
  ),
);

export type SiteHeaderLink = {
  href: string;
  label: string;
  prefetch?: boolean;
};

const defaultLinks: SiteHeaderLink[] = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#features", label: "What stays yours" },
  { href: "#pricing", label: "Pricing" },
];

/**
 * Shared by the factory homepage and every niche storefront. `createHref` is a
 * prop so a niche can carry its own vertical into the studio — the lead has to
 * arrive already attached to the niche that produced it, and this header is the
 * first link that could lose it.
 */
export function SiteHeader({
  brand,
  links = defaultLinks,
  createHref = "/create",
  ctaLabel = "Build a preview",
  inverse = false,
  fontVariables,
}: {
  brand: BrandIdentity & { href?: string };
  links?: SiteHeaderLink[];
  createHref?: string;
  ctaLabel?: string;
  inverse?: boolean;
  fontVariables: string;
}) {
  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b backdrop-blur-xl",
        inverse
          ? "border-white/10 bg-[#050505]/88 text-white"
          : "border-border/70 bg-background/88",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
        <Brand {...brand} inverse={inverse} prefetch={false} />
        <nav
          className={cn(
            "hidden items-center gap-7 text-sm md:flex",
            inverse ? "text-white/58" : "text-muted-foreground",
          )}
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              prefetch={link.prefetch}
              className={cn(
                "transition-colors",
                inverse ? "hover:text-white" : "hover:text-foreground",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Button
            render={<Link href="/dashboard" />}
            nativeButton={false}
            variant="ghost"
            size="sm"
            className={
              inverse
                ? "text-white/65 hover:bg-white/8 hover:text-white"
                : undefined
            }
          >
            Sign in
          </Button>
          <Button
            render={<Link href={createHref} />}
            nativeButton={false}
            size="sm"
            className={
              inverse
                ? "border-white bg-white text-black hover:bg-white/82"
                : undefined
            }
          >
            {ctaLabel}
            <ArrowUpRight className="size-3.5" />
          </Button>
        </div>
        <SiteHeaderMobileNav
          brand={brand}
          links={links}
          createHref={createHref}
          ctaLabel={ctaLabel}
          inverse={inverse}
          fontVariables={fontVariables}
        />
      </div>
    </header>
  );
}
