import { Vertical } from "@/generated/prisma/enums";
import {
  accessFailureResponse,
  getSiteAccess,
} from "@/lib/authorization";
import { fromRestaurantDraft, restaurantDraftSchema } from "@/lib/restaurant";
import { localServiceSiteDraftSchema } from "@/lib/verticals/local-service/schema";
import { isSameOriginMutation } from "@/lib/request-origin";
import {
  DraftRevisionConflictError,
  updateSiteDraft,
} from "@/lib/site-persistence";

export async function PUT(
  request: Request,
  { params }: RouteContext<"/api/sites/[slug]">,
) {
  if (!isSameOriginMutation(request, { requireOrigin: true })) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { slug } = await params;
  const access = await getSiteAccess(slug);
  if (!access.ok) return accessFailureResponse(access);

  // Only verticals with a shipped owner editor are writable. This keeps beauty
  // sites from falling through to either a restaurant or trade-shaped parser.
  if (
    access.site.vertical !== Vertical.RESTAURANT &&
    access.site.vertical !== Vertical.LOCAL_SERVICE
  ) {
    return Response.json(
      {
        error:
          "Owner editing for this vertical is not available yet. Use import and claim flows until the vertical editor ships.",
      },
      { status: 409 },
    );
  }

  try {
    const body = (await request.json()) as {
      expectedRevision?: unknown;
      [key: string]: unknown;
    };
    const expectedRevision =
      typeof body.expectedRevision === "number" &&
      Number.isInteger(body.expectedRevision) &&
      body.expectedRevision >= 0
        ? body.expectedRevision
        : undefined;
    const draftBody = { ...body };
    delete draftBody.expectedRevision;
    const draft =
      access.site.vertical === Vertical.RESTAURANT
        ? fromRestaurantDraft(restaurantDraftSchema.parse(draftBody))
        : localServiceSiteDraftSchema.parse(draftBody);
    // Same shared column and relation mapping as the import path. Vertical
    // always comes from the authorized site record, never the request body.
    const saved = await updateSiteDraft(
      slug,
      draft,
      access.site.vertical,
      { actor: access.user, expectedRevision },
    );
    return Response.json({
      ok: true,
      persisted: true,
      revision: saved.revision,
    });
  } catch (error) {
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
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Site could not be saved",
      },
      { status: 400 },
    );
  }
}
