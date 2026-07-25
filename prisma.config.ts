import { loadEnvConfig } from "@next/env";
import { defineConfig } from "prisma/config";

loadEnvConfig(process.cwd());

// `prisma generate` only needs a syntactically valid URL and does not connect.
// Runtime access still fails closed in src/lib/db.ts when DATABASE_URL is absent.
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://build:build@prisma-generate.invalid:5432/cornershopdev";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
