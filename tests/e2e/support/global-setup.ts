import { execFileSync } from "node:child_process";

export default async function globalSetup() {
  execFileSync("bun", ["tests/e2e/support/database.ts", "seed"], {
    env: process.env,
    stdio: "inherit",
  });
}
