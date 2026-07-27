import {
  accessFailureResponse,
  getSiteAccess,
} from "@/lib/authorization";
import { regenerateRestaurantTranslation } from "@/lib/ai/site-generation";
import { fromRestaurantDraft, localeSchema } from "@/lib/restaurant";
import { getRestaurantDraft } from "@/lib/restaurants";
import { updateSiteDraft } from "@/lib/site-persistence";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  _request: Request,
  {
    params,
  }: RouteContext<"/api/sites/[slug]/translations/[locale]/regenerate">,
) {
  const { slug, locale: rawLocale } = await params;
  const access = await getSiteAccess(slug);
  if (!access.ok) return accessFailureResponse(access);
  const locale = localeSchema.safeParse(rawLocale);
  if (!locale.success) {
    return Response.json({ error: "Unsupported locale" }, { status: 400 });
  }

  try {
    const draft = await getRestaurantDraft(access.site.slug);
    if (
      !draft.translations.some(
        (translation) => translation.locale === locale.data,
      )
    ) {
      return Response.json({ error: "Translation not found" }, { status: 404 });
    }
    const regenerated = await regenerateRestaurantTranslation(
      draft,
      locale.data,
    );
    await updateSiteDraft(
      access.site.slug,
      fromRestaurantDraft(regenerated),
      access.site.vertical,
    );
    return Response.json({ ok: true, draft: regenerated });
  } catch (error) {
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
