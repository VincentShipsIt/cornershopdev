import { AfterDarkTheme } from "@/components/restaurant-themes/after-dark";
import { CounterServiceTheme } from "@/components/restaurant-themes/counter-service";
import {
  RestaurantStructuredData,
  type RestaurantThemeRendererInputProps,
  type RestaurantThemeRendererProps,
} from "@/components/restaurant-themes/shared";
import { TerroirEditorialTheme } from "@/components/restaurant-themes/terroir-editorial";
import { getSiteDictionary } from "@/lib/site-i18n";
import type { RestaurantThemeId } from "@/lib/site-themes/restaurant/contracts";
import { restaurantConfig } from "@/lib/verticals/restaurant/config";

type RestaurantThemeRenderer = (
  props: RestaurantThemeRendererProps,
) => React.ReactNode;

const renderers = {
  "terroir-editorial": TerroirEditorialTheme,
  "counter-service": CounterServiceTheme,
  "after-dark": AfterDarkTheme,
} satisfies Record<RestaurantThemeId, RestaurantThemeRenderer>;

export function hasRestaurantThemeRenderer(id: RestaurantThemeId): boolean {
  return Boolean(renderers[id]);
}

export function RestaurantThemeRenderer(
  props: RestaurantThemeRendererInputProps,
) {
  const Renderer = renderers[props.selection.themeId];
  const locale = props.locale ?? props.draft.defaultLocale;
  const dictionary =
    props.dictionary ?? getSiteDictionary(restaurantConfig, locale);
  return (
    <>
      <RestaurantStructuredData
        draft={props.draft}
        enabled={Boolean(props.analyticsEnabled)}
      />
      <Renderer {...props} locale={locale} dictionary={dictionary} />
    </>
  );
}
