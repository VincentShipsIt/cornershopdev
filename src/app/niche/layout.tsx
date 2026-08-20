import { RestaurantFontScope } from "@/components/fonts/restaurant-font-scope";

export default function NicheLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RestaurantFontScope>{children}</RestaurantFontScope>;
}
