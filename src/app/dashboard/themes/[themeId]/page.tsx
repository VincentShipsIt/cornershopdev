import type { Metadata } from "next";
import { OwnerThemePreview } from "@/app/dashboard/themes/[themeId]/owner-theme-preview";

export const metadata: Metadata = {
  title: "Owner theme preview",
  robots: { index: false, follow: false },
};

export default async function OwnerThemePreviewPage({
  params,
}: {
  params: Promise<{ themeId: string }>;
}) {
  const { themeId } = await params;
  return <OwnerThemePreview themeId={themeId} />;
}
