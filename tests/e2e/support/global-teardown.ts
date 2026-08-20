import { execFileSync } from "node:child_process";

export default async function globalTeardown() {
  execFileSync("bun", ["tests/e2e/support/database.ts", "cleanup"], {
    env: process.env,
    stdio: "inherit",
  });
}
