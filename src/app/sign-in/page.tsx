import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/brand";
import { SignInForm } from "@/app/sign-in/sign-in-form";
import { Button } from "@/components/ui/button";
import { resolveRequestBrand } from "@/lib/verticals/request-site";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default async function SignInPage() {
  // Sign-in is served off whichever niche domain the visitor was already on, so
  // it wears that storefront's brand rather than the factory's.
  const brand = await resolveRequestBrand();

  return (
    <main className="min-h-screen">
      <header className="flex h-16 items-center gap-4 border-b px-5">
        <Button
          render={<Link href="/" />}
          variant="ghost"
          size="icon-sm"
        >
          <ArrowLeft />
        </Button>
        <Brand {...brand} />
      </header>
      <div className="grid min-h-[calc(100vh-4rem)] place-items-center px-5 py-16">
        <SignInForm />
      </div>
    </main>
  );
}
