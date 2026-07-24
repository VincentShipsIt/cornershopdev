import Link from "next/link";
import { ArrowUpRight, Menu } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const links = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#features", label: "What stays yours" },
  { href: "#pricing", label: "Pricing" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/88 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
        <Brand />
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-foreground"
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
          >
            Sign in
          </Button>
          <Button
            render={<Link href="/create" />}
            nativeButton={false}
            size="sm"
          >
            Build a preview
            <ArrowUpRight className="size-3.5" />
          </Button>
        </div>
        <Sheet>
          <SheetTrigger
            className="grid size-9 place-items-center rounded-full border md:hidden"
            aria-label="Open navigation"
          >
            <Menu className="size-4" />
          </SheetTrigger>
          <SheetContent className="p-6">
            <SheetHeader>
              <SheetTitle className="text-left">
                <Brand />
              </SheetTitle>
            </SheetHeader>
            <nav className="mt-10 flex flex-col gap-5 text-lg">
              {links.map((link) => (
                <SheetClose
                  key={link.href}
                  render={<Link href={link.href} />}
                >
                  {link.label}
                </SheetClose>
              ))}
              <SheetClose render={<Link href="/dashboard" />}>
                Sign in
              </SheetClose>
              <Button
                render={<Link href="/create" />}
                nativeButton={false}
                className="mt-4"
              >
                Build a preview
              </Button>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
