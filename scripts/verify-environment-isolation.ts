import { Client } from "pg";
import {
  fingerprintDatabaseIdentity,
  verifyDatabaseIsolation,
} from "@/lib/environment-isolation";

const productionUrl = process.env.PRODUCTION_DATABASE_URL;
const previewUrl = process.env.PREVIEW_DATABASE_URL;
if (!productionUrl || !previewUrl) {
  console.error(
    JSON.stringify({
      check: "database-environment-isolation",
      verified: false,
      failure: "database_urls_missing",
    }),
  );
  process.exit(1);
}

try {
  const configuration = verifyDatabaseIsolation({
    productionUrl,
    previewUrl,
  });
  const [productionObserved, previewObserved] = await Promise.all([
    observedDatabaseIdentity(productionUrl),
    observedDatabaseIdentity(previewUrl),
  ]);
  const productionObservedFingerprint = fingerprintDatabaseIdentity(
    productionObserved,
  );
  const previewObservedFingerprint =
    fingerprintDatabaseIdentity(previewObserved);
  if (productionObservedFingerprint === previewObservedFingerprint) {
    throw new Error("observed identities match");
  }

  console.log(
    JSON.stringify(
      {
        check: "database-environment-isolation",
        verified: true,
        configuration,
        observed: {
          isolated: true,
          productionIdentity: productionObservedFingerprint,
          previewIdentity: previewObservedFingerprint,
        },
        verifiedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
} catch {
  console.error(
    JSON.stringify({
      check: "database-environment-isolation",
      verified: false,
      failure: "connection_or_identity_check_failed",
      failedAt: new Date().toISOString(),
    }),
  );
  process.exitCode = 1;
}

async function observedDatabaseIdentity(connectionString: string) {
  const client = new Client({
    connectionString,
    application_name: "cornershopdev-isolation-verifier",
    connectionTimeoutMillis: 5_000,
    statement_timeout: 5_000,
  });
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    const result = await client.query<{
      database: string;
      address: string | null;
      port: number | null;
    }>(
      `SELECT current_database() AS database,
              inet_server_addr()::text AS address,
              inet_server_port() AS port`,
    );
    await client.query("ROLLBACK");
    const row = result.rows[0];
    if (!row?.database) throw new Error("identity unavailable");
    return `${row.address ?? "unix"}:${row.port ?? 5432}/${row.database}`;
  } finally {
    await client.end().catch(() => undefined);
  }
}
