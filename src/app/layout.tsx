import type { Metadata } from "next";
import { FACTORY_BRAND } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://cornershop.dev",
  ),
  title: {
    default: "Cornershopdev — the website factory for small business",
    template: "%s | Cornershopdev",
  },
  description:
    "One engine, one database and a focused storefront brand for every trade.",
  icons: FACTORY_BRAND.mark
    ? {
        icon: [
          {
            url: FACTORY_BRAND.mark.faviconSrc,
            type: "image/png",
            sizes: "32x32",
          },
        ],
        apple: [
          {
            url: FACTORY_BRAND.mark.appleTouchIconSrc,
            type: "image/png",
            sizes: "180x180",
          },
        ],
      }
    : undefined,
  openGraph: {
    title: "Cornershopdev",
    description: "The website factory for small business.",
    siteName: "Cornershopdev",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col antialiased">{children}</body>
    </html>
  );
}
