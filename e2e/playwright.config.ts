import { defineConfig, devices } from "@playwright/test";

// E2E against `wrangler dev` serving the built web app + API on one origin, with a local D1
// and captured emails (APP_ENV=development). Run `pnpm build` first (pnpm e2e does).
export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:8787",
    trace: "retain-on-failure",
    // Mobile-first: most users are on Android phones.
    ...devices["Pixel 7"],
  },
  webServer: {
    command: "pnpm --filter @factory/api db:migrate:local && pnpm --filter @factory/api dev",
    url: "http://localhost:8787/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    cwd: "..",
  },
});
