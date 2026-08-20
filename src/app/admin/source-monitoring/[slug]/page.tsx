import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SourceMonitoringPanel } from "@/components/source-monitoring-panel";
import { Button } from "@/components/ui/button";
import { getSuperadminAccess } from "@/lib/authorization";
import { getCurrentSession } from "@/lib/current-session";
import { getDb } from "@/lib/db";
import { getSourceMonitoringDashboard } from "@/lib/source-monitoring";

export const dynamic = "force-dynamic";

export default async function OperatorSourceMonitoringPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/sign-in");
  if (!(await getSuperadminAccess())) notFound();

  const { slug } = await params;
  const site = await getDb().site.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, draftRevision: true },
  });
  if (!site) notFound();
  const monitoring = await getSourceMonitoringDashboard(site.id);

  return (
    <main className="min-h-screen bg-[#f3f1eb] px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl">
        <Button render={<Link href="/admin" />} variant="outline" size="sm">
          Back to operator console
        </Button>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Operator review · {site.name}
        </p>
        <div className="mt-4 rounded-2xl border bg-background p-5 md:p-8">
          <SourceMonitoringPanel
            siteSlug={site.slug}
            initial={monitoring}
            draftRevision={site.draftRevision}
            hasUnsavedChanges={false}
          />
        </div>
      </div>
    </main>
  );
}
