import { Geist, Instrument_Serif } from "next/font/google";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  preload: true,
});

export const restaurantFontVariables = `${geistSans.variable} ${instrumentSerif.variable} restaurant-fonts`;

export function RestaurantFontScope({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${restaurantFontVariables} contents font-sans`}>
      {children}
    </div>
  );
}
