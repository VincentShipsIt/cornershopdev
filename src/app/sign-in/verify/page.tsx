import type { Metadata } from "next";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { AuthShell } from "@/app/sign-in/auth-shell";
import { Button } from "@/components/ui/button";
import { signInSurface } from "@/lib/sign-in-surface";
import { cn } from "@/lib/utils";
import { resolveRequestMarketing } from "@/lib/verticals/request-site";

export async function generateMetadata(): Promise<Metadata> {
  const surface = signInSurface(await resolveRequestMarketing());
  return {
    title: { absolute: `Confirm sign in | ${surface.brand.name}` },
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default async function VerifySignInPage() {
  const surface = signInSurface(await resolveRequestMarketing());

  return (
    <AuthShell surface={surface} backHref="/sign-in">
      <section
        className={cn(
          "w-full max-w-md border bg-card p-7",
          surface.inverse
            ? "rounded-2xl shadow-[0_28px_80px_rgb(0_0_0/0.56)]"
            : "rounded-3xl shadow-xl",
        )}
      >
        <span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
          <ShieldCheck className="size-5" />
        </span>
        <h1
          className={cn(
            "mt-5 leading-none tracking-[-0.045em]",
            surface.inverse
              ? "text-4xl font-semibold"
              : "font-display text-5xl",
          )}
        >
          Confirm it&apos;s you.
        </h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Your secure link is ready. Continue to open your workspace. This
          confirmation keeps automated email scanners from using the link before
          you do.
        </p>
        <form action="/api/auth/verify" method="post" className="mt-7">
          <Button type="submit" className="h-11 w-full">
            Continue securely
            <ArrowRight />
          </Button>
        </form>
      </section>
    </AuthShell>
  );
}
