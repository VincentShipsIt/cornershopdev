import { ImageResponse } from "next/og";
import { FACTORY_BRAND } from "@/lib/brand";
import { resolveRequestMarketing } from "@/lib/verticals/request-site";

// Brand-neutral: this file has no route params to key a static alt string on
// per niche, so it stays generic rather than always reading "Cornershopdev".
export const alt = "Website storefront preview";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const FACTORY_HEADLINE = "One factory. A storefront for every trade.";
const FACTORY_SUBHEADLINE = "One engine, one database, one deploy.";

/**
 * Every route that doesn't define its own `opengraph-image` inherits this
 * one — including `/create`, `/claim/[slug]` and `/dashboard` on a niche
 * hostname. Reading the Host header (the same `resolveRequestMarketing` that
 * already drives sign-in and the dashboard shell) keeps a restofront.com
 * share card from carrying the factory's own name and copy.
 */
export default async function OpenGraphImage() {
  const marketing = await resolveRequestMarketing();
  const brand = marketing?.brand ?? FACTORY_BRAND;
  const headline = marketing?.tagline ?? FACTORY_HEADLINE;
  const subheadline = marketing?.footerTagline ?? FACTORY_SUBHEADLINE;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          color: "#1F2622",
          background: "#F7F1E7",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 58,
              height: 58,
              position: "relative",
              borderRadius: 14,
              background: "#0D4A39",
              color: "#F7F1E7",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              fontWeight: 700,
            }}
          >
            {brand.initials}
            <div
              style={{
                position: "absolute",
                left: 7,
                top: 0,
                display: "flex",
                gap: 3,
              }}
            >
              {[0, 1, 2].map((stripe) => (
                <div
                  key={stripe}
                  style={{
                    width: 9,
                    height: 14,
                    borderRadius: 3,
                    background: "#F15A3D",
                  }}
                />
              ))}
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{brand.name}</div>
        </div>
        <div
          style={{
            display: "flex",
            maxWidth: 900,
            fontFamily: "Georgia, serif",
            fontSize: 92,
            lineHeight: 0.9,
            letterSpacing: "-5px",
          }}
        >
          {headline}
        </div>
        <div style={{ display: "flex", fontSize: 23, color: "#646863" }}>
          {subheadline}
        </div>
      </div>
    ),
    size,
  );
}
