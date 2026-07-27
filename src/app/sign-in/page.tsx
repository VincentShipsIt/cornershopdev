import type { Metadata } from "next";
import { AuthShell } from "@/app/sign-in/auth-shell";
import { SignInForm } from "@/app/sign-in/sign-in-form";
import { signInSurface } from "@/lib/sign-in-surface";
import { resolveRequestMarketing } from "@/lib/verticals/request-site";

export async function generateMetadata(): Promise<Metadata> {
  const surface = signInSurface(await resolveRequestMarketing());
  return {
    title: { absolute: `Sign in | ${surface.brand.name}` },
    robots: { index: false, follow: false },
  };
}

export default async function SignInPage() {
  const surface = signInSurface(await resolveRequestMarketing());

  return (
    <AuthShell surface={surface} backHref="/">
      <SignInForm copy={surface.copy} inverse={surface.inverse} />
    </AuthShell>
  );
}
