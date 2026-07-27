import type { Metadata } from "next";
import { OwnerThemePreview } from "@/app/dashboard/themes/[themeId]/owner-theme-preview";

export const metadata: Metadata = {
  title: "Owner theme preview",
  robots: { index: false, follow: false },
};

export default async function LocalizedOwnerThemePreviewPage({
  params,
}: {
  params: Promise<{ themeId: string; locale: string }>;
}) {
  const { themeId, locale } = await params;
  return <OwnerThemePreview themeId={themeId} locale={locale} />;
}
