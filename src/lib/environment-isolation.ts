import { createHash } from "node:crypto";
import { normalizeHostname } from "@/lib/request-hostname";

export type DatabaseIsolationEvidence = {
  isolated: true;
  productionIdentity: string;
  previewIdentity: string;
};

export function verifyDatabaseIsolation(input: {
  productionUrl: string;
  previewUrl: string;
}): DatabaseIsolationEvidence {
  const production = databaseIdentity(input.productionUrl);
  const preview = databaseIdentity(input.previewUrl);
  if (production === preview) {
    throw new Error(
      "Production and Preview resolve to the same database identity.",
    );
  }
  return {
    isolated: true,
    productionIdentity: fingerprint(production),
    previewIdentity: fingerprint(preview),
  };
}

export function isDatabaseLoopbackHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized.startsWith("127.")
  );
}

function databaseIdentity(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Both database values must be valid PostgreSQL URLs.");
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("Both database values must be PostgreSQL URLs.");
  }
  if (isDatabaseLoopbackHostname(url.hostname)) {
    throw new Error("Deployed database identities cannot use a local host.");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  if (!database) throw new Error("Both database URLs must name a database.");
  const port = url.port || "5432";
  const schema = url.searchParams.get("schema") || "public";
  return `${url.hostname.toLowerCase()}:${port}/${database}?schema=${schema}`;
}

export function fingerprintDatabaseIdentity(value: string): string {
  if (!value.trim()) throw new Error("Database identity cannot be empty.");
  return fingerprint(value);
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
