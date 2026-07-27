import { z } from "zod";
import {
  accessFailureResponse,
  getSiteAccess,
} from "@/lib/authorization";
import {
  rollbackPublishedSiteVersion,
  SitePublicationStateError,
} from "@/lib/site-publication";

const rollbackRequestSchema = z
  .object({
    siteVersionId: z.string().trim().min(1).max(128),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const access = await getSiteAccess(slug);
  if (!access.ok) return accessFailureResponse(access);

  const parsed = rollbackRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json(
      { error: "Choose a valid published version" },
      { status: 400 },
    );
  }

  try {
    const published = await rollbackPublishedSiteVersion({
      siteId: access.site.id,
      slug: access.site.slug,
      vertical: access.site.vertical,
      targetSiteVersionId: parsed.data.siteVersionId,
      actor: access.user,
    });
    return Response.json({ ok: true, published });
  } catch (error) {
    if (error instanceof SitePublicationStateError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (
      error instanceof Error &&
      error.message === "Published site version not found"
    ) {
      return Response.json({ error: error.message }, { status: 404 });
    }

    console.error("[site-rollback] failed", {
      slug,
      actorId: access.user.id,
      error: error instanceof Error ? error.message : "unknown",
    });
    return Response.json(
      { error: "Site could not be rolled back" },
      { status: 500 },
    );
  }
}
