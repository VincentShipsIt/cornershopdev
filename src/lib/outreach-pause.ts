export const GLOBAL_OUTREACH_PAUSE_KEY = "outreach.paused";
export const SITE_OUTREACH_PAUSE_PREFIX = "outreach.paused.site.";

export function siteOutreachPauseKey(siteId: string): string {
  return `${SITE_OUTREACH_PAUSE_PREFIX}${siteId}`;
}

export function isOutreachPaused(
  settings: Array<{ key: string; value: unknown }>,
  siteId: string,
): boolean {
  const keys = new Set([GLOBAL_OUTREACH_PAUSE_KEY, siteOutreachPauseKey(siteId)]);
  return settings.some(
    (setting) => keys.has(setting.key) && setting.value !== false,
  );
}
