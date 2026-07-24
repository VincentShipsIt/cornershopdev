import type { ErasedVerticalConfig } from "@/lib/verticals/registry";
import type { VerticalTemplateCopy } from "@/lib/verticals/types";

/**
 * Picks the best entry from a locale-keyed record: exact locale, then the bare
 * language, then `en`, then whatever the vertical shipped first. This replaces the
 * old hardcoded `fr`-or-`en` branch — with the same outcome for the restaurant
 * dictionaries (`fr`/`fr-FR` → fr, everything else → en) — so a vertical that
 * ships more locales, or fewer, needs no renderer change.
 */
function pickLocaleEntry<T>(byLocale: Record<string, T>, locale: string): T {
  const normalized = locale.toLowerCase();
  return (
    byLocale[normalized] ??
    byLocale[normalized.split("-")[0]] ??
    byLocale.en ??
    Object.values(byLocale)[0]
  );
}

export function getSiteDictionary(
  config: ErasedVerticalConfig,
  locale: string,
): Record<string, string> {
  return pickLocaleEntry(config.i18n, locale);
}

export function getTemplateCopy(
  template: { copy: Record<string, VerticalTemplateCopy> },
  locale: string,
): VerticalTemplateCopy {
  return pickLocaleEntry(template.copy, locale);
}

export function localizeIntegrationUrl(url: string, locale: string): string {
  try {
    const localizedUrl = new URL(url);
    if (!localizedUrl.searchParams.has("lang")) return url;
    localizedUrl.searchParams.set("lang", locale.split("-")[0].toLowerCase());
    return localizedUrl.toString();
  } catch {
    return url;
  }
}
