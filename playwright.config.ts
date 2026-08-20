import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "first-customer.pw.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  globalSetup: "./tests/e2e/support/global-setup.ts",
  globalTeardown: "./tests/e2e/support/global-teardown.ts",
  reporter: [["line"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "bun tests/e2e/support/fake-providers.ts",
      url: "http://127.0.0.1:4100/_health",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "PORT=3100 HOSTNAME=127.0.0.1 bun run start",
      url: "http://127.0.0.1:3100/api/health/live",
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
