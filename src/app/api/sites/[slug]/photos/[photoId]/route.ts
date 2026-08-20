import { z } from "zod";
import { accessFailureResponse } from "@/lib/authorization";
import { getPhotoLibraryAccess } from "@/lib/photo-access";
import { PhotoLibraryError, reviewPhoto } from "@/lib/photo-library";
import { isSameOriginMutation } from "@/lib/request-origin";

const reviewSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve_original") }),
  z.object({ action: z.literal("reject_original") }),
  z.object({ action: z.literal("approve_enhancement") }),
  z.object({ action: z.literal("reject_enhancement") }),
  z.object({ action: z.literal("restore_original") }),
  z.object({ action: z.literal("select_hero") }),
  z.object({ action: z.literal("select_gallery") }),
  z.object({ action: z.literal("select_catalog"), catalogItemId: z.string().min(1).max(100) }),
  z.object({ action: z.literal("unselect") }),
]);

export async function PATCH(
  request: Request,
  { params }: RouteContext<"/api/sites/[slug]/photos/[photoId]">,
) {
  if (!isSameOriginMutation(request, { requireOrigin: true })) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { slug, photoId } = await params;
  const access = await getPhotoLibraryAccess(slug);
  if (!access.ok) return accessFailureResponse(access);
  try {
    const review = reviewSchema.parse(await request.json());
    return Response.json(
      await reviewPhoto({
        siteId: access.site.id,
        photoId,
        actor: access.actor,
        review,
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
            : "The photo review could not be saved",
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
