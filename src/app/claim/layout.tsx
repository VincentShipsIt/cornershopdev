import { EditorialFontScope } from "@/components/fonts/editorial-font-scope";

export default function ClaimLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <EditorialFontScope>{children}</EditorialFontScope>;
}
