"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import type { BrandIdentity } from "@/lib/brand";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { SiteHeaderLink } from "@/components/site-header";

/**
 * The mobile hamburger drawer for `SiteHeader`, split into its own module and
 * loaded via `next/dynamic` (see `site-header.tsx`). `@base-ui/react/dialog`
 * (the `Sheet` primitive this wraps) is the single biggest client-only
 * dependency in the header — code-splitting it out of the header's main
 * chunk keeps that portal/focus-trap machinery, which only matters once a
 * visitor actually taps the trigger, off the critical hydration path for
 * every route that renders `SiteHeader` (the homepage and every niche
 * storefront).
 */
export function SiteHeaderMobileNav({
  brand,
  links,
  createHref,
  ctaLabel,
  inverse = false,
}: {
  brand: BrandIdentity & { href?: string };
  links: SiteHeaderLink[];
  createHref: string;
  ctaLabel: string;
  inverse?: boolean;
}) {
  return (
    <Sheet>
      <SheetTrigger
        className={cn(
          "grid size-9 place-items-center rounded-full border md:hidden",
          inverse ? "border-white/18 text-white" : "",
        )}
        aria-label="Open navigation"
      >
        <Menu className="size-4" />
      </SheetTrigger>
      <SheetContent
        className={cn(
          "p-6",
          inverse
            ? "border-white/10 bg-[#080808] text-white [&_[data-slot=sheet-close]]:text-white"
            : "",
        )}
      >
        <SheetHeader>
          <SheetTitle className={cn("text-left", inverse ? "text-white" : "")}>
            <Brand {...brand} inverse={inverse} />
          </SheetTitle>
        </SheetHeader>
        <nav className="mt-10 flex flex-col gap-5 text-lg">
          {links.map((link) => (
            <SheetClose
              key={link.href}
              render={<Link href={link.href} />}
              nativeButton={false}
            >
              {link.label}
            </SheetClose>
          ))}
          <SheetClose render={<Link href="/dashboard" />} nativeButton={false}>
            Sign in
          </SheetClose>
          <Button
            render={<Link href={createHref} />}
            nativeButton={false}
            className={cn(
              "mt-4",
              inverse
                ? "border-white bg-white text-black hover:bg-white/82"
                : "",
            )}
          >
            {ctaLabel}
          </Button>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
