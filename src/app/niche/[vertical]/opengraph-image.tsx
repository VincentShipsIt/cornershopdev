import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import {
  isVerticalPubliclyAccessible,
  listPublicVerticals,
  resolveVerticalBySlug,
  resolveVerticalConfig,
  verticalSlug,
} from "@/lib/verticals/registry";

/**
 * The social card for a niche storefront (restofront.com and its successors).
 *
 * The factory's root `opengraph-image.tsx` is inherited by every nested route
 * that does not define its own, which is how restofront.com came to unfurl with
 * "One factory. A storefront for every trade." Same canvas and palette as that
 * card so the family reads as one product; the mark, name and copy are the
 * niche's own, taken from its marketing config rather than hand-written here.
 */

// A static alt rather than `generateImageMetadata`: Next's wrapper for that
// export enumerates ids with the parent segments' static params, and nothing
// above this file declares any for `[vertical]`, so it runs with an undefined
// slug at build. Same route shape as the root card, one file per niche image.
export const alt = "Niche storefront card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return listPublicVerticals().map((id) => ({ vertical: verticalSlug(id) }));
}

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ vertical: string }>;
}) {
  const { vertical } = await params;
  const id = resolveVerticalBySlug(vertical);
  if (!id || !isVerticalPubliclyAccessible(id)) notFound();
  const { marketing } = resolveVerticalConfig(id);
  const { brand, hero, tagline } = marketing;

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
              borderRadius: 14,
              background: "#0D4A39",
              color: "#F7F1E7",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: "-1px",
            }}
          >
            {brand.initials}
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
          {hero.headline}
        </div>
        <div style={{ display: "flex", fontSize: 23, color: "#646863" }}>
          {tagline}
        </div>
      </div>
    ),
    size,
  );
}
