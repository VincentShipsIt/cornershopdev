import { z } from "zod";
import { enhanceRestaurantImage } from "@/lib/ai/restaurant-generation";
import { getCurrentSession } from "@/lib/current-session";
import { getDb } from "@/lib/db";
import { fetchPublicImage } from "@/lib/importer";
import { storeRestaurantImage } from "@/lib/storage/images";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  sourceImageUrl: z
    .url()
    .refine((value) => value.startsWith("https://"), "Use an HTTPS image URL"),
  restaurantSlug: z.string().trim().min(2).max(80),
  restaurantName: z.string().trim().min(2).max(120).optional(),
  enhancementNotes: z.string().trim().min(5).max(500).optional(),
});

export async function POST(request: Request) {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const {
      sourceImageUrl,
      restaurantSlug,
      restaurantName,
      enhancementNotes,
    } = requestSchema.parse(await request.json());
    if (session.restaurantSlug !== restaurantSlug) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    if (process.env.DATABASE_URL) {
      const restaurant = await getDb().site.findUnique({
        where: { slug: restaurantSlug },
        select: {
          heroImageUrl: true,
          heroOriginalImageUrl: true,
        },
      });
      if (!restaurant) {
        return Response.json(
          { error: "Restaurant not found" },
          { status: 404 },
        );
      }
      const approvedSources = new Set(
        [restaurant.heroOriginalImageUrl, restaurant.heroImageUrl].filter(
          (value): value is string => Boolean(value),
        ),
      );
      if (!approvedSources.has(sourceImageUrl)) {
        return Response.json(
          { error: "Choose an approved image from this restaurant's library" },
          { status: 409 },
        );
      }
    }

    const originalImage = await fetchPublicImage(sourceImageUrl);
    const originalUrl = await storeRestaurantImage({
      restaurantSlug,
      data: originalImage.data,
      mediaType: originalImage.mediaType,
      purpose: "original-hero",
    });
    const image = await enhanceRestaurantImage({
      sourceImageUrl: originalUrl,
      restaurantName,
      enhancementNotes,
    });
    const url = await storeRestaurantImage({
      restaurantSlug,
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
