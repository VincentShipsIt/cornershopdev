import { z } from "zod";
import { enhanceSiteImage } from "@/lib/ai/site-generation";
import {
  accessFailureResponse,
  getSiteAccess,
} from "@/lib/authorization";
import { getDb } from "@/lib/db";
import { fetchPublicImage } from "@/lib/importer";
import { isSameOriginMutation } from "@/lib/request-origin";
import { storeSiteImage } from "@/lib/storage/images";
import { resolveVerticalConfig } from "@/lib/verticals/registry";
import type { VerticalId } from "@/lib/verticals/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  sourceImageUrl: z
    .url()
    .refine((value) => value.startsWith("https://"), "Use an HTTPS image URL"),
  siteSlug: z.string().trim().min(2).max(80),
  siteName: z.string().trim().min(2).max(120).optional(),
  enhancementNotes: z.string().trim().min(5).max(500).optional(),
});

export async function POST(request: Request) {
  try {
    if (!isSameOriginMutation(request, { requireOrigin: true })) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    const { sourceImageUrl, siteSlug, siteName, enhancementNotes } =
      requestSchema.parse(await request.json());
    const access = await getSiteAccess(siteSlug);
    if (!access.ok) return accessFailureResponse(access);

    const site = await getDb().site.findUnique({
      where: { id: access.site.id },
      select: {
        heroImageUrl: true,
        heroOriginalImageUrl: true,
      },
    });
    if (!site) {
      return Response.json({ error: "Site not found" }, { status: 404 });
    }
    const vertical: VerticalId = access.site.vertical;
    const approvedSources = new Set(
      [site.heroOriginalImageUrl, site.heroImageUrl].filter(
        (value): value is string => Boolean(value),
      ),
    );
    if (!approvedSources.has(sourceImageUrl)) {
      return Response.json(
        { error: "Choose an approved image from this site's library" },
        { status: 409 },
      );
    }

    const originalImage = await fetchPublicImage(sourceImageUrl);
    const originalUrl = await storeSiteImage({
      siteSlug,
      vertical,
      data: originalImage.data,
      mediaType: originalImage.mediaType,
      purpose: "original-hero",
    });
    // The enhancement guardrails (what the model may not alter) are per-vertical:
    // a restaurant's are about food and plating, a salon's about skin, hair and
    // treatment results. Resolving them off the site's own vertical is what keeps
    // this route from quietly applying the wrong ones.
    const image = await enhanceSiteImage(
      {
        sourceImageUrl: originalUrl,
        siteName,
        enhancementNotes,
      },
      resolveVerticalConfig(vertical),
    );
    const url = await storeSiteImage({
      siteSlug,
      vertical,
      data: image.data,
      mediaType: image.mediaType,
      purpose: "hero",
    });

    return Response.json({ url, originalUrl });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Image enhancement failed",
      },
      { status: 400 },
    );
  }
}
