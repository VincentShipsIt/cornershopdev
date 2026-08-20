import { z } from "zod";
import {
  accessFailureResponse,
  getSiteAccess,
} from "@/lib/authorization";
import {
  billingAccessFailureResponse,
  getSiteBillingAccess,
} from "@/lib/billing-access";
import {
  publishSiteDraft,
  SitePublicationStateError,
  SitePublicationTranslationError,
} from "@/lib/site-publication";
import { captureOperatorAlert } from "@/lib/operator-alerts";
import { isSameOriginMutation } from "@/lib/request-origin";
import { DraftRevisionConflictError } from "@/lib/site-persistence";

const publishRequestSchema = z.object({
  changeSummary: z.string().trim().min(3).max(280),
  expectedRevision: z.number().int().min(0),
});

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/sites/[slug]/publish">,
) {
  if (!isSameOriginMutation(request, { requireOrigin: true })) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { slug } = await params;
  const access = await getSiteAccess(slug);
  if (!access.ok) return accessFailureResponse(access);
  const billing = await getSiteBillingAccess(access.site.id);
  if (!billing.ok) return billingAccessFailureResponse(billing);

  const parsed = publishRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json(
      {
        error:
          "Describe the changes in 3 to 280 characters and reload the current draft revision before publishing.",
        code: "DRAFT_REVISION_REQUIRED",
      },
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
      expectedRevision: parsed.data.expectedRevision,
    });
    return Response.json({ ok: true, published });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("[site-publish] persisted draft validation failed", {
        slug,
        issues: error.issues,
      });
      await captureOperatorAlert({
        kind: "PUBLISH_FAILURE",
        dedupKey: `${access.site.id}:persisted-draft`,
        title: "Persisted site draft failed publication validation",
        message:
          "A saved draft could not be published because persisted content failed schema validation. Inspect the site draft and recent editor changes.",
        context: {
          siteId: access.site.id,
          slug: access.site.slug,
          category: "validation",
        },
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
    if (error instanceof DraftRevisionConflictError) {
      return Response.json(
        {
          error: error.message,
          code: "DRAFT_REVISION_CONFLICT",
          currentRevision: error.currentRevision,
        },
        { status: 409 },
      );
    }

    console.error("[site-publish] failed", {
      slug,
      actorId: access.user.id,
      error: error instanceof Error ? error.message : "unknown",
    });
    await captureOperatorAlert({
      kind: "PUBLISH_FAILURE",
      dedupKey: `${access.site.id}:server`,
      title: "Site publication failed",
      message:
        "A valid owner publication request failed on the server. Inspect database availability, billing state, and application logs.",
      context: {
        siteId: access.site.id,
        slug: access.site.slug,
        actorId: access.user.id,
        category: "server",
      },
    });
    return Response.json(
      { error: "Site could not be published" },
      { status: 500 },
    );
  }
}
