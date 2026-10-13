// Gives each E2E run a fresh local D1 and KV (D-064). E2E's wrangler dev and its migrations use
// `--persist-to .wrangler/e2e` in apps/api, never `pnpm dev`'s .wrangler/state, and this empties
// that folder first. Otherwise counters such as the anonymous free uses per IP per day
// (127.0.0.1 for every run) carry over between runs until the funnel test hits the cap.
//
// Usage: node scripts/e2e-state.mjs  (e2e/playwright.config.ts runs it before migrating)
import { rmSync } from "node:fs";
import path from "node:path";

/** E2E's own persistence folder, relative to apps/api (where wrangler runs). */
export const E2E_STATE = ".wrangler/e2e";

/** Empties E2E's state folder under `apiDir`. Only ever that folder. */
export function resetE2eState(apiDir) {
  const dir = path.join(apiDir, E2E_STATE);
  rmSync(dir, { recursive: true, force: true });
  return dir;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  resetE2eState(path.join(import.meta.dirname, "../apps/api"));
}
