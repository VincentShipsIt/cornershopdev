import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Dashboard } from "@/app/dashboard/dashboard";
import { getCurrentSession } from "@/lib/current-session";
import { getRestaurantDraft } from "@/lib/restaurants";
import { sampleRestaurant } from "@/lib/restaurant";

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

  const draft = session
    ? await getRestaurantDraft(session.siteSlug)
    : sampleRestaurant;

  return (
    <Dashboard
      initialDraft={draft}
      email={session?.email ?? "demo@restofront.com"}
      checkoutComplete={query.checkout === "success"}
      demo={!session}
    />
  );
}
