import { Vertical } from "@/generated/prisma/enums";
import {
  accessFailureResponse,
  getSiteAccess,
} from "@/lib/authorization";
import { fromRestaurantDraft, restaurantDraftSchema } from "@/lib/restaurant";
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

  // Owner editors are restaurant-shaped today. Reject other verticals so a
  // beauty site can never be rewritten as Osteria Luna through this route.
  if (access.site.vertical !== Vertical.RESTAURANT) {
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
    const draft = restaurantDraftSchema.parse(draftBody);
    // Same column and relation mapping as the import path, so an owner edit can
    // never write a shape the read path refuses to parse. Vertical always comes
    // from the authorized site record, never the request body.
    const saved = await updateSiteDraft(
      slug,
      fromRestaurantDraft(draft),
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
            : "Restaurant could not be saved",
      },
      { status: 400 },
    );
  }
}
