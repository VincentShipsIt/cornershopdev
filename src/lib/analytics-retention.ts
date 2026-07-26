export const ANALYTICS_RETENTION_DAYS = 120;

const DAY_MS = 24 * 60 * 60_000;

/**
 * Raw analytics uses a rolling duration rather than calendar-day arithmetic,
 * keeping the cutoff stable across daylight-saving and timezone boundaries.
 */
export function analyticsRetentionCutoff(now: Date): Date {
  const timestamp = now.getTime();
  if (!Number.isFinite(timestamp)) {
    throw new RangeError("Analytics retention requires a valid date");
  }
  return new Date(timestamp - ANALYTICS_RETENTION_DAYS * DAY_MS);
}
