import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { resolveRequestBrand } from "@/lib/verticals/request-site";

export const metadata: Metadata = {
  title: "Confirm sign in",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function VerifySignInPage() {
  const brand = await resolveRequestBrand();

  return (
    <main className="min-h-screen">
      <header className="flex h-16 items-center gap-4 border-b px-5">
        <Button
          render={<Link href="/sign-in" />}
          variant="ghost"
          size="icon-sm"
        >
          <ArrowLeft />
        </Button>
        <Brand {...brand} />
      </header>
      <div className="grid min-h-[calc(100vh-4rem)] place-items-center px-5 py-16">
        <section className="w-full max-w-md rounded-3xl border bg-card p-7 shadow-xl">
          <span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="size-5" />
          </span>
          <h1 className="font-display mt-5 text-5xl leading-none tracking-[-0.045em]">
            Confirm it&apos;s you.
          </h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Your secure link is ready. Continue to open your workspace. This
            confirmation keeps automated email scanners from using the link
            before you do.
          </p>
          <form action="/api/auth/verify" method="post" className="mt-7">
            <Button type="submit" className="h-11 w-full">
              Continue securely
              <ArrowRight />
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}
