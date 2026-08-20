import { accessFailureResponse, getSiteAccess } from "@/lib/authorization";
import { regenerateRestaurantTranslation } from "@/lib/ai/site-generation";
import { fromRestaurantDraft, localeSchema } from "@/lib/restaurant";
import { isSameOriginMutation } from "@/lib/request-origin";
import { getRestaurantDraft } from "@/lib/restaurants";
import { limitTranslationRegeneration } from "@/lib/rate-limit";
import {
  DraftRevisionConflictError,
  updateSiteDraft,
} from "@/lib/site-persistence";
import { regenerateAndPersistRestaurantTranslation } from "@/lib/translation-regeneration";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const regenerationRequestSchema = z.object({
  expectedRevision: z.number().int().min(0),
});

export async function POST(
  request: Request,
  {
    params,
  }: RouteContext<"/api/sites/[slug]/translations/[locale]/regenerate">,
) {
  if (!isSameOriginMutation(request, { requireOrigin: true })) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  }
  const { slug, locale: rawLocale } = await params;
  const access = await getSiteAccess(slug);
  if (!access.ok) return accessFailureResponse(access);
  const rateLimit = await limitTranslationRegeneration(request);
  if (!rateLimit.success) {
    return Response.json(
      {
        error:
          rateLimit.reason === "unavailable"
            ? "Translation regeneration is temporarily unavailable"
            : "Too many translation requests. Try again later.",
      },
      { status: rateLimit.reason === "unavailable" ? 503 : 429 },
    );
  }
  const locale = localeSchema.safeParse(rawLocale);
  if (!locale.success) {
    return Response.json({ error: "Unsupported locale" }, { status: 400 });
  }

  const requestBody = regenerationRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!requestBody.success) {
    return Response.json(
      {
        error: "Reload the current draft revision before regenerating.",
        code: "DRAFT_REVISION_REQUIRED",
      },
      { status: 400 },
    );
  }

  try {
    if (access.site.vertical !== "RESTAURANT") {
      return Response.json(
        { error: "Translation regeneration is only available for restaurants" },
        { status: 409 },
      );
    }
    const draft = await getRestaurantDraft(access.site.slug);
    if (!draft) {
      return Response.json({ error: "Restaurant not found" }, { status: 404 });
    }
    if (
      !draft.translations.some(
        (translation) => translation.locale === locale.data,
      )
    ) {
      return Response.json({ error: "Translation not found" }, { status: 404 });
    }
    const regenerated = await regenerateAndPersistRestaurantTranslation({
      slug: access.site.slug,
      locale: locale.data,
      vertical: access.site.vertical,
      actor: access.user,
      expectedRevision: requestBody.data.expectedRevision,
      draft,
      regenerate: regenerateRestaurantTranslation,
      toPersistableDraft: fromRestaurantDraft,
      persist: updateSiteDraft,
    });
    return Response.json({ ok: true, ...regenerated });
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
    const unavailable =
      error instanceof Error &&
      error.message === "Translation regeneration is not configured";
    console.error("[menu-translation] regeneration failed", {
      slug,
      locale: locale.data,
      actorId: access.user.id,
      error: error instanceof Error ? error.message : "unknown",
    });
    return Response.json(
      {
        error: unavailable
          ? "Translation regeneration is temporarily unavailable"
          : "Translation could not be regenerated",
      },
      { status: unavailable ? 503 : 500 },
    );
  }
}
