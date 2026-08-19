import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/brand";
import { ClaimPanel } from "@/app/claim/[slug]/claim-panel";
import { Button } from "@/components/ui/button";
import { findSiteView } from "@/lib/sites";
import { resolveVerticalConfig } from "@/lib/verticals/registry";

type ClaimPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    checkout?: string;
    session_id?: string;
    claim_id?: string;
  }>;
};

// The site's own vertical, not the Host header, decides the brand here too:
// an owner can reach their claim link from anywhere.
export async function generateMetadata({
  params,
}: ClaimPageProps): Promise<Metadata> {
  const { slug } = await params;
  const site = await findSiteView(slug);
  if (!site) notFound();
  const brand = resolveVerticalConfig(site.vertical).marketing.brand;
  return {
    title: { absolute: `Claim your ${brand.name} site` },
    robots: { index: false, follow: false },
  };
}

export default async function ClaimPage({
  params,
  searchParams,
}: ClaimPageProps) {
  const { slug } = await params;
  const query = await searchParams;
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
        checkoutReturn={
          query.checkout === "processing" &&
          query.session_id &&
          query.claim_id
            ? {
                sessionId: query.session_id,
                claimInvitationId: query.claim_id,
              }
            : null
        }
      />
    </main>
  );
}
