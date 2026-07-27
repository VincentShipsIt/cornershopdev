import { z } from "zod";
import {
  accessFailureResponse,
  getSiteAccess,
} from "@/lib/authorization";
import {
  publishSiteDraft,
  SitePublicationStateError,
  SitePublicationTranslationError,
} from "@/lib/site-publication";

const publishRequestSchema = z.object({
  changeSummary: z.string().trim().min(3).max(280),
});

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/sites/[slug]/publish">,
) {
  const { slug } = await params;
  const access = await getSiteAccess(slug);
  if (!access.ok) return accessFailureResponse(access);

  const parsed = publishRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json(
      { error: "Describe the changes in 3 to 280 characters" },
      { status: 400 },
    );
  }

  try {
    const published = await publishSiteDraft({
      siteId: access.site.id,
      slug: access.site.slug,
      vertical: access.site.vertical,
      actor: access.user,
      changeSummary: parsed.data.changeSummary,
    });
    return Response.json({ ok: true, published });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("[site-publish] persisted draft validation failed", {
        slug,
        issues: error.issues,
      });
      return Response.json(
        { error: "Fix the invalid draft fields before publishing" },
        { status: 422 },
      );
    }
    if (error instanceof SitePublicationStateError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof SitePublicationTranslationError) {
      return Response.json({ error: error.message }, { status: 409 });
    }

    console.error("[site-publish] failed", {
      slug,
      actorId: access.user.id,
      error: error instanceof Error ? error.message : "unknown",
    });
    return Response.json(
      { error: "Site could not be published" },
      { status: 500 },
    );
  }
}
