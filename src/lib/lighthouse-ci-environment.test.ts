import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dir, "../..");
const require = createRequire(import.meta.url);

type LighthouseConfig = {
  ci: {
    collect: { numberOfRuns: number };
    assert: {
      aggregationMethod?: string;
      assertions: Record<string, [string, Record<string, number>]>;
    };
  };
};

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

  it("asserts the median run and retains hidden Lighthouse reports", async () => {
    const config = require(
      path.join(repoRoot, "lighthouserc.cjs"),
    ) as LighthouseConfig;
    const workflow = await readFile(
      path.join(repoRoot, ".github/workflows/ci.yml"),
      "utf8",
    );

    expect(config.ci.collect.numberOfRuns).toBe(3);
    expect(config.ci.assert.aggregationMethod).toBe("median");
    expect(config.ci.assert.assertions["categories:performance"]).toEqual([
      "error",
      { minScore: 0.9 },
    ]);
    expect(config.ci.assert.assertions["largest-contentful-paint"]).toEqual([
      "error",
      { maxNumericValue: 3800 },
    ]);
    expect(workflow).toContain("          include-hidden-files: true\n");
  });
});
