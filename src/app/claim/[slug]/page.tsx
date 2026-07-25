import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/brand";
import { ClaimPanel } from "@/app/claim/[slug]/claim-panel";
import { Button } from "@/components/ui/button";
import { findSiteView } from "@/lib/sites";
import { resolveVerticalConfig } from "@/lib/verticals/registry";

export const metadata: Metadata = {
  title: "Claim this site",
  robots: { index: false, follow: false },
};

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const site = await findSiteView(slug);
  if (!site) notFound();

  // The site itself knows which niche produced it, which is a stronger signal
  // than the Host header: an owner can reach their claim link from anywhere.
  const brand = resolveVerticalConfig(site.vertical).marketing.brand;

  return (
    <main className="min-h-screen">
      <header className="flex h-16 items-center gap-4 border-b px-5">
        <Button
          render={<Link href="/create" />}
          variant="ghost"
          size="icon-sm"
        >
          <ArrowLeft />
        </Button>
        <Brand {...brand} />
      </header>
      <ClaimPanel
        slug={slug}
        vertical={site.vertical}
        fallbackDraft={site.draft}
      />
    </main>
  );
}
