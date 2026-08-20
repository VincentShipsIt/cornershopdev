import { createHash } from "node:crypto";

export function evidenceDigest(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

/**
 * Compares JSON values after recursively canonicalizing object keys. PostgreSQL
 * jsonb does not preserve insertion order, so persistence boundaries must not
 * use raw JSON.stringify output as an equality contract.
 */
export function sameJsonValue(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
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
