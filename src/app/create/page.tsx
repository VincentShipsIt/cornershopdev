import { headers } from "next/headers";
import type { Metadata } from "next";
import { Vertical } from "@/generated/prisma/enums";
import { ImportStudio } from "@/app/create/import-studio";
import { brandContextForHeaders } from "@/lib/brand-context";
import { resolveVerticalBySlug } from "@/lib/verticals/registry";

export async function generateMetadata(): Promise<Metadata> {
  const brand = brandContextForHeaders(await headers());
  return {
    title: { absolute: `Build a preview — ${brand.name}` },
    robots: { index: false, follow: false },
  };
}

export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; vertical?: string }>;
}) {
  const { source = "", vertical = "" } = await searchParams;
  // The niche the lead arrived through, set by the storefront that sent them.
  // An unknown or absent slug falls back to restaurants rather than 404ing: the
  // visitor can still change it in the picker, and losing them over a bad query
  // string would cost a lead for no gain.
  const initialVertical = resolveVerticalBySlug(vertical) ?? Vertical.RESTAURANT;
  // The Host header's brand, independent of which trade is preselected above —
  // the studio needs both to tell "which niche produced this lead" apart from
  // "whose storefront is the visitor standing in".
  const initialBrand = brandContextForHeaders(await headers());
  return (
    <ImportStudio
      initialSource={source}
      initialVertical={initialVertical}
      initialBrand={initialBrand}
    />
  );
}
