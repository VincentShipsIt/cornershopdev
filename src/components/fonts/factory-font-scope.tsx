import { Geist, Geist_Mono } from "next/font/google";

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

export const factoryFontVariables = `${geistSans.variable} ${geistMono.variable}`;

export function FactoryFontScope({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${factoryFontVariables} contents font-sans`}>
      {children}
    </div>
  );
}
