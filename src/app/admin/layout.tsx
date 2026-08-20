import { EditorialFontScope } from "@/components/fonts/editorial-font-scope";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <EditorialFontScope>{children}</EditorialFontScope>;
}
