import { Vertical } from "@/generated/prisma/enums";
import {
  accessFailureResponse,
  getSiteAccess,
} from "@/lib/authorization";
import { fromRestaurantDraft, restaurantDraftSchema } from "@/lib/restaurant";
import { updateSiteDraft } from "@/lib/site-persistence";

type RouteContext = { params: Promise<{ slug: string }> };

export async function PUT(request: Request, { params }: RouteContext) {
  const { slug } = await params;
  const access = await getSiteAccess(slug);
  if (!access.ok) return accessFailureResponse(access);

  try {
    const draft = restaurantDraftSchema.parse(await request.json());
    if (!process.env.DATABASE_URL) {
      return Response.json({ ok: true, persisted: false });
    }

    // Same column and relation mapping as the import path, so an owner edit can
    // never write a shape the read path refuses to parse.
    await updateSiteDraft(
      slug,
      fromRestaurantDraft(draft),
      Vertical.RESTAURANT,
    );
    return Response.json({ ok: true, persisted: true });
  } catch (error) {
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
