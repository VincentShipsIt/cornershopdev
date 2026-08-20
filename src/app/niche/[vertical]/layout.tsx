import { notFound } from "next/navigation";
import { NicheFontScope } from "@/components/fonts/niche-font-scope";
import { resolveVerticalBySlug } from "@/lib/verticals/registry";

export default async function NicheLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ vertical: string }>;
}) {
  const { vertical } = await params;
  const id = resolveVerticalBySlug(vertical);
  if (!id) notFound();

  return <NicheFontScope vertical={id}>{children}</NicheFontScope>;
}
