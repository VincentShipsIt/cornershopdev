import { restaurantDraftSchema } from "@/lib/restaurant";
import { getCurrentSession } from "@/lib/current-session";
import { getDb } from "@/lib/db";

type RouteContext = { params: Promise<{ slug: string }> };

export async function PUT(request: Request, { params }: RouteContext) {
  const { slug } = await params;
  const session = await getCurrentSession();
  if (!session || session.restaurantSlug !== slug) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const draft = restaurantDraftSchema.parse(await request.json());
    if (!process.env.DATABASE_URL) {
      return Response.json({ ok: true, persisted: false });
    }

    await getDb().site.update({
      where: { slug },
      data: {
        name: draft.name,
        description: draft.description,
        address: draft.address,
        phone: draft.phone,
        heroImageUrl: draft.heroImageUrl,
        heroOriginalImageUrl: draft.heroOriginalImageUrl,
        heroImageProvenance: toDatabaseImageProvenance(
          draft.heroImageProvenance,
        ),
        attributes: {
          cuisine: draft.cuisine,
          showMenuImages: draft.showMenuImages,
        },
        autoEnhanceImages: draft.autoEnhanceImages,
        defaultLocale: draft.defaultLocale,
        translations: draft.translations,
        catalogSections: {
          deleteMany: {},
          create: draft.menuSections.map((section, sectionIndex) => ({
            name: section.name,
            description: section.description,
            position: sectionIndex,
            items: {
              create: section.items.map((item, itemIndex) => ({
                name: item.name,
                description: item.description,
                price: item.price,
                currency: item.currency,
                attributes: {
                  dietaryLabels: item.dietaryLabels,
                },
                imageUrl: item.imageUrl,
                originalImageUrl: item.originalImageUrl,
                imageProvenance: toDatabaseImageProvenance(
                  item.imageProvenance,
                ),
                position: itemIndex,
              })),
            },
          })),
        },
        integrations: {
          deleteMany: {},
          create: draft.integrations.map((integration) => ({
            type: integration.type.toUpperCase() as
              | "BOOKING"
              | "ORDERING"
              | "DELIVERY"
              | "SOCIAL",
            label: integration.label,
            provider: integration.provider,
            url: integration.url,
          })),
        },
      },
    });
    return Response.json({ ok: true, persisted: true });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Restaurant could not be saved",
      },
      { status: 400 },
    );
  }
}

function toDatabaseImageProvenance(
  value: "official" | "owner" | "permissioned-ugc" | null | undefined,
): "OFFICIAL" | "OWNER" | "PERMISSIONED_UGC" | undefined {
  if (!value) return undefined;
  if (value === "permissioned-ugc") return "PERMISSIONED_UGC";
  return value.toUpperCase() as "OFFICIAL" | "OWNER";
}
