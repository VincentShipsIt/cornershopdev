import { ImageResponse } from "next/og";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  factoryMetadataOrigin,
  previewOgCard,
  type LivePreviewOgCard,
} from "@/lib/preview-metadata";
import { loadPublicHeroImageDataUrl } from "@/lib/opengraph-hero";
import { liveSiteVersionId } from "@/lib/site-surface";
import {
  findPublishedSiteView,
  findSiteView,
} from "@/lib/sites";

/**
 * Social card for a generated customer site. Nested routes inherit the root
 * `opengraph-image.tsx` unless this segment defines its own, which is how
 * restaurant URLs unfurled as Cornershopdev.
 */

export const alt = "Business website";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const versionId = liveSiteVersionId(await headers(), slug);
  const site = versionId
    ? await findPublishedSiteView(slug, versionId)
    : await findSiteView(slug);
  if (!site) notFound();

  const card = previewOgCard(site.draft, {
    isLiveSurface: versionId !== null,
  });
  if (card.kind === "unpublished") {
    return new ImageResponse(<UnpublishedCard name={card.name} />, size);
  }

  if (card.heroImageUrl) {
    const heroSrc = await loadPublicHeroImageDataUrl(
      resolvePublicUrl(card.heroImageUrl, factoryMetadataOrigin()),
    );
    if (heroSrc) {
      return new ImageResponse(
        <HeroCard card={card} heroSrc={heroSrc} />,
        size,
      );
    }
  }

  return new ImageResponse(<BrandedCard card={card} />, size);
}

function UnpublishedCard({ name }: { name: string }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px",
        color: "#2C2F2B",
        background: "#E8E6E1",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ display: "flex", fontSize: 22, color: "#6B6E68" }}>
        Private preview
      </div>
      <div
        style={{
          display: "flex",
          maxWidth: 960,
          fontSize: name.length > 28 ? 64 : 84,
          lineHeight: 0.95,
          letterSpacing: "-3px",
          fontWeight: 700,
        }}
      >
        {name}
      </div>
      <div style={{ display: "flex", fontSize: 22, color: "#6B6E68" }}>
        Not yet published
      </div>
    </div>
  );
}

function BrandedCard({ card }: { card: LivePreviewOgCard }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px",
        color: card.palette.foreground,
        background: card.palette.background,
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          width: 58,
          height: 58,
          borderRadius: 14,
          background: card.palette.accent,
          color: card.palette.background,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
          fontWeight: 700,
          letterSpacing: "-1px",
        }}
      >
        {card.initials}
      </div>
      <div
        style={{
          display: "flex",
          maxWidth: 960,
          fontFamily: "Georgia, serif",
          fontSize: card.name.length > 28 ? 64 : 92,
          lineHeight: 0.95,
          letterSpacing: "-4px",
        }}
      >
        {card.name}
      </div>
      <div style={{ display: "flex", fontSize: 23, opacity: 0.72 }}>
        {card.tagline}
      </div>
    </div>
  );
}

function HeroCard({
  card,
  heroSrc,
}: {
  card: LivePreviewOgCard;
  heroSrc: string;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        background: card.palette.foreground,
      }}
    >
      <img
        alt=""
        src={heroSrc}
        width={size.width}
        height={size.height}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          width: "100%",
          height: "100%",
          padding: "72px",
          background:
            "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.12) 55%, rgba(0,0,0,0) 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            color: "#FFFFFF",
            fontFamily: "Georgia, serif",
            fontSize: card.name.length > 28 ? 56 : 76,
            lineHeight: 0.95,
            letterSpacing: "-3px",
          }}
        >
          {card.name}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 18,
            color: "rgba(255,255,255,0.86)",
            fontSize: 26,
            fontFamily: "Arial, sans-serif",
          }}
        >
          {card.tagline}
        </div>
      </div>
    </div>
  );
}

function resolvePublicUrl(url: string, origin: string): string {
  if (url.startsWith("https://") || url.startsWith("http://")) return url;
  try {
    return new URL(url, origin).href;
  } catch {
    return url;
  }
}
