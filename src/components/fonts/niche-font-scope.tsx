import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { Vertical } from "@/generated/prisma/enums";
import type { VerticalId } from "@/lib/verticals/types";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["ui-monospace", "monospace"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  preload: true,
});

const sharedNicheFontVariables = `${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} stable-geist-fallback stable-instrument-fallback`;

export function nicheFontVariables(vertical: VerticalId): string {
  return `${sharedNicheFontVariables}${
    vertical === Vertical.RESTAURANT ? " restaurant-fonts" : ""
  }`;
}

export function NicheFontScope({
  children,
  vertical,
}: {
  children: React.ReactNode;
  vertical: VerticalId;
}) {
  return (
    <div className={`${nicheFontVariables(vertical)} contents font-sans`}>
      {children}
    </div>
  );
}
