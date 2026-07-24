import { getDb } from "@/lib/db";
import { leadDrafts } from "@/lib/lead-drafts";
import {
  restaurantDraftSchema,
  sampleRestaurant,
  type RestaurantDraft,
} from "@/lib/restaurant";
import { getVerticalConfig } from "@/lib/verticals/registry";

export async function getRestaurantDraft(
  slug: string,
): Promise<RestaurantDraft> {
  return (
    (await findRestaurantDraft(slug)) ?? {
      ...sampleRestaurant,
      slug,
    }
  );
}

export async function findRestaurantDraft(
  slug: string,
): Promise<RestaurantDraft | null> {
  const leadDraft = leadDrafts[slug];
  if (!process.env.DATABASE_URL) {
    if (leadDraft) return leadDraft;
    return slug === sampleRestaurant.slug ? sampleRestaurant : null;
  }

  const restaurant = await getDb().site.findUnique({
    where: { slug },
    include: {
      integrations: { orderBy: { createdAt: "asc" } },
      catalogSections: {
        orderBy: { position: "asc" },
        include: { items: { orderBy: { position: "asc" } } },
      },
      siteVersions: { orderBy: { version: "desc" }, take: 1 },
    },
  });

  if (!restaurant) return null;
  const vertical = getVerticalConfig(restaurant.vertical);
  const attributes = vertical.attributesSchema.parse(restaurant.attributes);
  const latestTheme = restaurant.siteVersions[0]?.theme as
    | RestaurantDraft["palette"]
    | undefined;

  return restaurantDraftSchema.parse({
    slug: restaurant.slug,
    name: restaurant.name,
    eyebrow: `${attributes.cuisine || "Independent restaurant"} · ${
      restaurant.address ?? "Local"
    }`,
    description: restaurant.description ?? sampleRestaurant.description,
    cuisine: attributes.cuisine,
    address: restaurant.address ?? "",
    phone: restaurant.phone ?? "",
    sourceUrl: restaurant.sourceUrl,
    heroImageUrl: restaurant.heroImageUrl,
    heroOriginalImageUrl: restaurant.heroOriginalImageUrl,
    heroImageProvenance:
      restaurant.heroImageProvenance?.toLowerCase().replace("_", "-") ?? null,
    palette: latestTheme ?? sampleRestaurant.palette,
    showMenuImages: attributes.showMenuImages,
    autoEnhanceImages: restaurant.autoEnhanceImages,
    defaultLocale: restaurant.defaultLocale,
    translations: restaurant.translations,
    menuSections: restaurant.catalogSections.map((section) => ({
      name: section.name,
      description: section.description ?? "",
      items: section.items.map((item) => {
        const itemAttributes = vertical.itemAttributesSchema.parse(
          item.attributes,
        );
        return {
          name: item.name,
          description: item.description ?? "",
          price: item.price === null ? null : Number(item.price),
          currency: item.currency,
          dietaryLabels: itemAttributes.dietaryLabels,
          imageUrl: item.imageUrl,
          originalImageUrl: item.originalImageUrl,
          imageProvenance:
            item.imageProvenance?.toLowerCase().replace("_", "-") ?? null,
        };
      }),
    })),
    integrations: restaurant.integrations.map((integration) => ({
      type: integration.type.toLowerCase(),
      label: integration.label,
      provider: integration.provider,
      url: integration.url,
    })),
  });
}
