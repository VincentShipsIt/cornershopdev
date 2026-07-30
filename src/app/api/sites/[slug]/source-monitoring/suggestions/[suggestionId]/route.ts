import { z } from "zod";
import { accessFailureResponse } from "@/lib/authorization";
import {
  reviewSourceMonitoringSuggestion,
  SourceMonitoringConflictError,
} from "@/lib/source-monitoring";
import { getSourceMonitoringAccess } from "@/lib/source-monitoring-access";
import { isSameOriginMutation } from "@/lib/request-origin";

const reviewSchema = z.object({
  action: z.enum(["accept", "reject"]),
  editedValue: z.unknown().optional(),
  note: z.string().trim().max(500).optional(),
});

export async function PATCH(
  request: Request,
  {
    params,
  }: RouteContext<
    "/api/sites/[slug]/source-monitoring/suggestions/[suggestionId]"
  >,
) {
  if (!isSameOriginMutation(request, { requireOrigin: true })) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { slug, suggestionId } = await params;
  const access = await getSourceMonitoringAccess(slug);
  if (!access.ok) return accessFailureResponse(access);

  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid review action" }, { status: 400 });
  }
  try {
    const result = await reviewSourceMonitoringSuggestion({
      siteId: access.site.id,
      suggestionId,
      actor: access.actor,
      ...parsed.data,
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof SourceMonitoringConflictError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "The edited suggestion is not valid for this site" },
        { status: 422 },
      );
    }
    console.error("[source-monitoring] review failed", {
      slug,
      suggestionId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return Response.json(
      { error: "The suggestion could not be reviewed" },
      { status: 500 },
    );
  }
}
