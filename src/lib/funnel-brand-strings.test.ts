import { describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Issue #95's acceptance criterion in code: nothing under the funnel a lead
 * actually walks (`/create`, `/claim/[slug]`, `/dashboard`, `/sign-in`) may
 * hard-code the factory's name. Each of those routes already resolves a
 * `BrandContext`/`VerticalMarketing` and must interpolate `brand.name`
 * instead — a literal "Cornershopdev" string is exactly the regression this
 * guards against (a Restofrontapp lead landing on a page that still reads
 * like a dev factory).
 */
const funnelDirectories = [
  "src/app/create",
  "src/app/claim",
  "src/app/dashboard",
  "src/app/sign-in",
];

const repoRoot = path.resolve(import.meta.dir, "../..");

function collectSourceFiles(dir: string): string[] {
  const absolute = path.join(repoRoot, dir);
  const files: string[] = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(entryPath));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
      files.push(entryPath);
    }
  }
  return files;
}

describe("funnel routes stay brand-neutral", () => {
  const files = funnelDirectories.flatMap(collectSourceFiles);

  it("found the funnel route files to check", () => {
    // A guard against the check silently checking nothing if the routes move.
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`does not hard-code "Cornershopdev" in ${file}`, async () => {
      const contents = await readFile(path.join(repoRoot, file), "utf8");
      expect(contents).not.toContain("Cornershopdev");
    });
  }
});
