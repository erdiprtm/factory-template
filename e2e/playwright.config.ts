import { defineConfig, devices } from "@playwright/test";

// E2E against `wrangler dev` serving the built web app + API on one origin, with a local D1
// and captured emails (APP_ENV=development). Run `pnpm build` first (pnpm e2e does).
//
// Its own port, never `pnpm dev`'s 8787, and never an already running server (D-051): a stale
// `wrangler dev` has old code or other vars, and another project's server on the port makes the
// start-up time out. port-free.mjs stops the run at once instead. The server's log (stdout) is
// hidden by Playwright; `DEBUG=pw:webserver pnpm e2e` shows it.
//
// Its own local D1 and KV too (D-064): `--persist-to .wrangler/e2e`, emptied and migrated at the
// start of every run, so counters (anonymous free uses per IP per day, rate limits) never carry
// over between runs or from `pnpm dev`'s .wrangler/state.
//
// Locally, 2 workers and 10 s for expect (D-071): every worker hits the one `wrangler dev` and its
// one SQLite D1, and on a busy laptop Playwright's default (half the cores) made flows that wait
// on the server (sign-in mail, billing return) miss 5 s. PW_WORKERS overrides it. CI keeps
// Playwright's defaults, so a slowdown there still shows.
const CI = Boolean(process.env.CI);
const PORT = 8788;
const BASE = `http://localhost:${PORT}`;
const STATE = "--persist-to .wrangler/e2e";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : CI ? undefined : 2,
  expect: { timeout: CI ? 5_000 : 10_000 },
  retries: CI ? 1 : 0,
  reporter: CI ? "github" : "list",
  use: {
    baseURL: BASE,
    trace: "retain-on-failure",
    // Mobile-first: most users are on Android phones.
    ...devices["Pixel 7"],
  },
  webServer: {
    command: [
      `node scripts/port-free.mjs ${PORT}`,
      "node scripts/e2e-state.mjs",
      `pnpm --filter @factory/api exec wrangler d1 migrations apply DB --local ${STATE}`,
      `pnpm --filter @factory/api exec wrangler dev ${STATE} --port ${PORT} --var APP_ENV:development --var AUTH_HOSTS:localhost:${PORT} --var ADMIN_EMAILS:admin@example.com`,
    ].join(" && "),
    url: `${BASE}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    cwd: "..",
  },
});
