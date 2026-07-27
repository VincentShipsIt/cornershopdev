import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Dashboard } from "@/app/dashboard/dashboard";
import { getSiteAnalyticsSummary } from "@/lib/analytics";
import { buildEmptyAnalyticsSummary } from "@/lib/analytics-contract";
import { getSiteAccess } from "@/lib/authorization";
import { getBookingRequestInbox } from "@/lib/booking-request-inbox";
import { getSiteBillingAccess } from "@/lib/billing-access";
import { getCurrentSession } from "@/lib/current-session";
import { getRestaurantDraft } from "@/lib/restaurants";
import { sampleRestaurant } from "@/lib/restaurant";
import { resolveRequestBrand } from "@/lib/verticals/request-site";
import { listAccountWorkspaces } from "@/lib/workspaces";

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
  if (session?.purpose === "WORKSPACE_SELECTION") redirect("/workspace/select");
  if (session?.purpose === "ADMIN") redirect("/admin");
  if (session && session.purpose !== "SITE") redirect("/sign-in");

  const access =
    session?.siteSlug ? await getSiteAccess(session.siteSlug) : null;
  if (session && (!access || !access.ok)) redirect("/sign-in");

  const [draft, analyticsSummary, bookingInbox, billingAccess, workspaces] = access?.ok
    ? await Promise.all([
        getRestaurantDraft(access.site.slug),
        getSiteAnalyticsSummary(access.site.id),
        getBookingRequestInbox(access.site.id),
        getSiteBillingAccess(access.site.id),
        listAccountWorkspaces(access.session.userId),
      ])
    : [
        sampleRestaurant,
        buildEmptyAnalyticsSummary(),
        {
          requests: [],
          total: 0,
          awaitingContact: 0,
          truncated: false,
        },
        null,
        [],
      ];

  return (
    <Dashboard
      initialDraft={draft}
      email={access?.ok ? access.user.email : "demo@cornershop.dev"}
      checkoutComplete={query.checkout === "success"}
      demo={!session}
      brand={await resolveRequestBrand()}
      analyticsSummary={analyticsSummary}
      bookingInbox={bookingInbox}
      billingAccess={billingAccess}
      canSwitchWorkspace={workspaces.length > 1}
    />
  );
}
