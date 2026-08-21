import { z } from "zod";
import { accessFailureResponse } from "@/lib/authorization";
import { getPhotoLibraryAccess } from "@/lib/photo-access";
import { enhanceApprovedPhotos, PhotoLibraryError } from "@/lib/photo-library";
import { limitPhotoEnhancement } from "@/lib/rate-limit";
import { isSameOriginMutation } from "@/lib/request-origin";

export const runtime = "nodejs";
export const maxDuration = 300;

const requestSchema = z.object({
  photoIds: z.array(z.string().min(1).max(100)).min(1).max(10),
  idempotencyKey: z.string().trim().min(16).max(100),
  enhancementNotes: z.string().trim().min(5).max(500).optional(),
});

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/sites/[slug]/photos/enhance">,
) {
  if (!isSameOriginMutation(request, { requireOrigin: true })) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { slug } = await params;
  const access = await getPhotoLibraryAccess(slug);
  if (!access.ok) return accessFailureResponse(access);
  const rateLimit = await limitPhotoEnhancement(request);
  if (!rateLimit.success) {
    return Response.json(
      { error: rateLimit.reason === "unavailable" ? "Image enhancement is temporarily unavailable" : "Too many enhancement batches" },
      { status: rateLimit.reason === "unavailable" ? 503 : 429 },
    );
  }
  try {
    const input = requestSchema.parse(await request.json());
    return Response.json(
      await enhanceApprovedPhotos({
        siteId: access.site.id,
        siteSlug: access.site.slug,
        vertical: access.site.vertical,
        ...input,
        actor: access.actor,
      }),
    );
  } catch (error) {
    const expected =
      error instanceof PhotoLibraryError ||
      error instanceof z.ZodError ||
      error instanceof SyntaxError;
    return Response.json(
      {
        error:
          expected && error instanceof Error
            ? error.message
            : "The enhancement batch failed",
      },
      {
        status:
          error instanceof PhotoLibraryError
            ? error.status
            : expected
              ? 400
              : 500,
      },
    );
  }
}
