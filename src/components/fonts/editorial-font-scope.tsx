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

export const editorialFontVariables = `${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} stable-geist-fallback stable-instrument-fallback`;

export function EditorialFontScope({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${editorialFontVariables} contents font-sans`}>
      {children}
    </div>
  );
}
