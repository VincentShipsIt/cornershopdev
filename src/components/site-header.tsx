import Link from "next/link";
import { ArrowUpRight, Menu } from "lucide-react";
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

export type SiteHeaderLink = { href: string; label: string };

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
}: {
  brand: BrandIdentity & { href?: string };
  links?: SiteHeaderLink[];
  createHref?: string;
  ctaLabel?: string;
  inverse?: boolean;
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
        <Brand {...brand} inverse={inverse} />
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
              <SheetTitle
                className={cn("text-left", inverse ? "text-white" : "")}
              >
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
              <SheetClose
                render={<Link href="/dashboard" />}
                nativeButton={false}
              >
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
      </div>
    </header>
  );
}
