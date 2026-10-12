import { defineConfig, devices } from "@playwright/test";

// E2E against `wrangler dev` serving the built web app + API on one origin, with a local D1
// and captured emails (APP_ENV=development). Run `pnpm build` first (pnpm e2e does).
//
// Its own port, never `pnpm dev`'s 8787, and never an already running server (D-051): a stale
// `wrangler dev` has old code or other vars, and another project's server on the port makes the
// start-up time out. port-free.mjs stops the run at once instead. The server's log (stdout) is
// hidden by Playwright; `DEBUG=pw:webserver pnpm e2e` shows it.
const PORT = 8788;
const BASE = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE,
    trace: "retain-on-failure",
    // Mobile-first: most users are on Android phones.
    ...devices["Pixel 7"],
  },
  webServer: {
    command: [
      `node scripts/port-free.mjs ${PORT}`,
      "pnpm --filter @factory/api db:migrate:local",
      `pnpm --filter @factory/api exec wrangler dev --port ${PORT} --var APP_ENV:development --var AUTH_HOSTS:localhost:${PORT} --var ADMIN_EMAILS:admin@example.com`,
    ].join(" && "),
    url: `${BASE}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    cwd: "..",
  },
});
