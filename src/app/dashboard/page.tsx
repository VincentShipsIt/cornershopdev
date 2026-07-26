import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Dashboard } from "@/app/dashboard/dashboard";
import { getSiteAccess } from "@/lib/authorization";
import { getCurrentSession } from "@/lib/current-session";
import { getRestaurantDraft } from "@/lib/restaurants";
import { sampleRestaurant } from "@/lib/restaurant";
import { resolveRequestBrand } from "@/lib/verticals/request-site";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string; checkout?: string }>;
}) {
  const query = await searchParams;
  const session = await getCurrentSession();
  if (!session && query.demo !== "1") redirect("/sign-in");
  if (session && !session.siteSlug) redirect("/admin");

  const access =
    session?.siteSlug ? await getSiteAccess(session.siteSlug) : null;
  if (session && (!access || !access.ok)) redirect("/sign-in");

  const draft =
    access?.ok ? await getRestaurantDraft(access.site.slug) : sampleRestaurant;

  return (
    <Dashboard
      initialDraft={draft}
      email={access?.ok ? access.user.email : "demo@cornershop.dev"}
      checkoutComplete={query.checkout === "success"}
      demo={!session}
      brand={await resolveRequestBrand()}
    />
  );
}
