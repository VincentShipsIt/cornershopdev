import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dir, "../..");

describe("Lighthouse CI environment", () => {
  it("uses the local Workflow world instead of inheriting Postgres", async () => {
    const workflow = await readFile(
      path.join(repoRoot, ".github/workflows/ci.yml"),
      "utf8",
    );

    expect(workflow).toContain(`
      - name: Lighthouse budgets
        env:
          WORKFLOW_TARGET_WORLD: "local"
        run: bun run lighthouse
`);
  });
});
