export type HeaderReader = Pick<Headers, "get">;

export function requestHostname(headers: HeaderReader): string {
  const forwarded = firstHeaderValue(headers.get("x-forwarded-host"));
  const host = forwarded || firstHeaderValue(headers.get("host"));
  return normalizeHostname(host);
}

export function normalizeHostname(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith("[")) {
    const closingBracket = normalized.indexOf("]");
    return closingBracket > 0
      ? normalized.slice(1, closingBracket)
      : normalized;
  }
  return normalized.replace(/:\d+$/, "").replace(/\.$/, "");
}

function firstHeaderValue(value: string | null): string {
  return value?.split(",")[0]?.trim() ?? "";
}
