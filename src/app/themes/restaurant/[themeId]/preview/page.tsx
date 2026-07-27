import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RestaurantThemeRenderer } from "@/components/restaurant-themes/restaurant-theme-renderer";
import {
  restaurantThemeIdSchema,
  type RestaurantThemeId,
} from "@/lib/site-themes/restaurant/contracts";
import { getRestaurantThemeFixture } from "@/lib/site-themes/restaurant/fixtures";
import {
  getRestaurantThemeManifest,
  listRestaurantThemeManifests,
} from "@/lib/site-themes/restaurant/registry";
import { parseRestaurantThemeSelection } from "@/lib/site-themes/restaurant/selection";

export const dynamicParams = false;

export function generateStaticParams() {
  return listRestaurantThemeManifests().map(({ id }) => ({ themeId: id }));
}

function parseThemeId(value: string): RestaurantThemeId | null {
  const parsed = restaurantThemeIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ themeId: string }>;
}): Promise<Metadata> {
  const id = parseThemeId((await params).themeId);
  if (!id) return {};

  const manifest = getRestaurantThemeManifest(id);
  return {
    title: { absolute: `${manifest.name} — full restaurant website preview` },
    description: manifest.description,
    robots: { index: false, follow: false },
  };
}

export default async function RestaurantThemeFullPreviewPage({
  params,
}: {
  params: Promise<{ themeId: string }>;
}) {
  const id = parseThemeId((await params).themeId);
  if (!id) notFound();

  const fixture = getRestaurantThemeFixture(id);
  const selection = parseRestaurantThemeSelection(
    fixture.attributes.themeSelection,
  );
  if (!selection) notFound();

  return <RestaurantThemeRenderer draft={fixture} selection={selection} />;
}
