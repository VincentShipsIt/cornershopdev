import { z } from "zod";
import { accessFailureResponse } from "@/lib/authorization";
import { getPhotoLibraryAccess } from "@/lib/photo-access";
import {
  getPhotoLibrary,
  ingestOwnerPhoto,
  PhotoLibraryError,
} from "@/lib/photo-library";
import {
  parseBoundedPhotoIngestBody,
  PhotoUploadBodyError,
} from "@/lib/photo-upload-body";
import { limitPhotoIngest } from "@/lib/rate-limit";
import { isSameOriginMutation } from "@/lib/request-origin";

export const runtime = "nodejs";

const usagesSchema = z.array(z.enum(["HERO", "GALLERY", "CATALOG"])).max(3);
const referenceSchema = z.object({
  sourceImageUrl: z.url().refine((value) => value.startsWith("https://")),
  candidateUsages: usagesSchema.default(["GALLERY"]),
});

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/sites/[slug]/photos">,
) {
  const { slug } = await params;
  const access = await getPhotoLibraryAccess(slug);
  if (!access.ok) return accessFailureResponse(access);
  return Response.json(await getPhotoLibrary(access.site.id), {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/sites/[slug]/photos">,
) {
  if (!isSameOriginMutation(request, { requireOrigin: true })) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { slug } = await params;
  const access = await getPhotoLibraryAccess(slug);
  if (!access.ok) return accessFailureResponse(access);
  const rateLimit = await limitPhotoIngest(request);
  if (!rateLimit.success) {
    return Response.json(
      { error: rateLimit.reason === "unavailable" ? "Photo storage is temporarily unavailable" : "Too many photo uploads" },
      { status: rateLimit.reason === "unavailable" ? 503 : 429 },
    );
  }
  try {
    const body = await parseBoundedPhotoIngestBody(request);
    if (body.kind === "multipart") {
      const form = body.form;
      const photo = form.get("photo");
      if (!(photo instanceof File)) {
        throw new PhotoLibraryError("Choose an image file to upload");
      }
      const candidateUsages = usagesSchema.parse(
        JSON.parse(String(form.get("candidateUsages") ?? '["GALLERY"]')),
      );
      return Response.json(
        await ingestOwnerPhoto({
          siteId: access.site.id,
          siteSlug: access.site.slug,
          vertical: access.site.vertical,
          upload: {
            data: new Uint8Array(await photo.arrayBuffer()),
            mediaType: photo.type,
            filename: photo.name,
          },
          candidateUsages,
          actor: access.actor,
        }),
        { status: 201 },
      );
    }
    const input = referenceSchema.parse(body.value);
    return Response.json(
      await ingestOwnerPhoto({
        siteId: access.site.id,
        siteSlug: access.site.slug,
        vertical: access.site.vertical,
        sourceUrl: input.sourceImageUrl,
        candidateUsages: input.candidateUsages,
        actor: access.actor,
      }),
      { status: 201 },
    );
  } catch (error) {
    const expected =
      error instanceof PhotoLibraryError ||
      error instanceof PhotoUploadBodyError ||
      error instanceof z.ZodError ||
      error instanceof SyntaxError;
    return Response.json(
      {
        error:
          expected && error instanceof Error
            ? error.message
            : "The photo could not be stored",
      },
      {
        status:
          error instanceof PhotoLibraryError
            ? error.status
            : error instanceof PhotoUploadBodyError
              ? error.status
            : expected
              ? 400
              : 500,
      },
    );
  }
}
