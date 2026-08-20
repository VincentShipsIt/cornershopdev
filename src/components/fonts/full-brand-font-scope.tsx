import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";

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
  preload: true,
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

export const fullBrandFontVariables = `${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable}`;

export function FullBrandFontScope({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${fullBrandFontVariables} contents font-sans`}>
      {children}
    </div>
  );
}
