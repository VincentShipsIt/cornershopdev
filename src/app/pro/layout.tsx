import { FullBrandFontScope } from "@/components/fonts/full-brand-font-scope";

export default function ProLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <FullBrandFontScope>{children}</FullBrandFontScope>;
}
