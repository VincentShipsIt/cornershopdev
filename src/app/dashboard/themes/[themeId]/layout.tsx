import { FullBrandFontScope } from "@/components/fonts/full-brand-font-scope";

export default function OwnerThemePreviewLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <FullBrandFontScope>{children}</FullBrandFontScope>;
}
