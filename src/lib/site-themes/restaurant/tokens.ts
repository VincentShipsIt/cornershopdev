import {
  restaurantThemeTokenOverrideSchema,
  restaurantThemeTokensSchema,
  type RestaurantThemeTokenOverride,
  type RestaurantThemeTokens,
} from "@/lib/site-themes/restaurant/contracts";

const MIN_TEXT_CONTRAST = 4.5;

function linearChannel(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return (
    0.2126 * linearChannel(red) +
    0.7152 * linearChannel(green) +
    0.0722 * linearChannel(blue)
  );
}

export function colorContrast(left: string, right: string): number {
  const brightest = Math.max(luminance(left), luminance(right));
  const darkest = Math.min(luminance(left), luminance(right));
  return (brightest + 0.05) / (darkest + 0.05);
}

function accessibleForeground(background: string, wanted: string): string {
  if (colorContrast(background, wanted) >= MIN_TEXT_CONTRAST) return wanted;
  return colorContrast(background, "#ffffff") >=
    colorContrast(background, "#111111")
    ? "#ffffff"
    : "#111111";
}

/**
 * Token overrides are a closed vocabulary, and colour repair runs after the
 * merge. A valid-looking model response therefore cannot produce unreadable
 * body text, surface text, or action labels.
 */
export function mergeRestaurantThemeTokens(
  defaults: RestaurantThemeTokens,
  candidate: RestaurantThemeTokenOverride | unknown = {},
): RestaurantThemeTokens {
  const parsed = restaurantThemeTokenOverrideSchema.safeParse(candidate);
  const override = parsed.success ? parsed.data : {};
  const merged = {
    colors: {
      ...defaults.colors,
      ...override.colors,
    },
    style: {
      ...defaults.style,
      ...override.style,
    },
  };

  merged.colors.foreground = accessibleForeground(
    merged.colors.background,
    merged.colors.foreground,
  );
  if (
    colorContrast(merged.colors.surface, merged.colors.foreground) <
    MIN_TEXT_CONTRAST
  ) {
    merged.colors.surface = merged.colors.background;
  }
  merged.colors.accentForeground = accessibleForeground(
    merged.colors.accent,
    merged.colors.accentForeground,
  );

  return restaurantThemeTokensSchema.parse(merged);
}
