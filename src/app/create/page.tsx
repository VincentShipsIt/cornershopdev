import type { Metadata } from "next";
import { Vertical } from "@/generated/prisma/enums";
import { ImportStudio } from "@/app/create/import-studio";
import { resolveVerticalBySlug } from "@/lib/verticals/registry";

export const metadata: Metadata = {
  title: "Build a preview",
  robots: { index: false, follow: false },
};

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
  return <ImportStudio initialSource={source} initialVertical={initialVertical} />;
}
