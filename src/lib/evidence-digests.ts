import { createHash } from "node:crypto";

export function evidenceDigest(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function integrationUrlDigest(
  integrations: Array<{
    type: string;
    url: string;
    enabled: boolean;
  }>,
): string {
  return evidenceDigest(
    integrations.map(({ type, url, enabled }) => ({ type, url, enabled })),
  );
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
    .join(",")}}`;
}
