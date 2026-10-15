// Gives each E2E run a fresh local D1 and KV (D-064). E2E's wrangler dev and its migrations use
// `--persist-to .wrangler/e2e` in apps/api, never `pnpm dev`'s .wrangler/state, and this empties
// that folder first. Otherwise counters such as the anonymous free uses per IP per day
// (127.0.0.1 for every run) carry over between runs until the funnel test hits the cap.
//
// One E2E run at a time (D-090): a run left going in the background (its session closed) had its
// state emptied under it by the next run, which then failed with "table consents already exists".
// The run's shell (this script's parent, which lives as long as wrangler dev) holds a lock with its
// PID; a live holder stops the new run with a clear message, a dead one's lock is taken over.
//
// Usage: node scripts/e2e-state.mjs  (e2e/playwright.config.ts runs it before migrating)
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

/** E2E's own persistence folder, relative to apps/api (where wrangler runs). */
export const E2E_STATE = ".wrangler/e2e";

/** Empties E2E's state folder under `apiDir`. Only ever that folder. */
export function resetE2eState(apiDir) {
  const dir = path.join(apiDir, E2E_STATE);
  rmSync(dir, { recursive: true, force: true });
  return dir;
}

/** E2E's lock file, relative to apps/api: the PID of the run that holds it. */
export const E2E_LOCK = ".wrangler/e2e.lock";

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: it exists but belongs to someone else, so it's alive.
    return err.code === "EPERM";
  }
};

/**
 * Takes the lock for `pid`. Returns the live PID that holds it instead, or null once it's ours.
 * A lock left by a run that has ended (no such process) is taken over.
 */
export function takeE2eLock(apiDir, pid, isAlive = alive) {
  const file = path.join(apiDir, E2E_LOCK);
  let holder = null;
  try {
    holder = Number(readFileSync(file, "utf8").trim()) || null;
  } catch {}
  if (holder && holder !== pid && isAlive(holder)) return holder;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${pid}\n`);
  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const apiDir = path.join(import.meta.dirname, "../apps/api");
  // The shell that runs this, then migrations, then wrangler dev: it lives as long as the run.
  const holder = takeE2eLock(apiDir, process.ppid);
  if (holder) {
    console.error(`Another E2E run is in progress (PID ${holder}). Stop it or wait: kill ${holder}`);
    process.exit(1);
  }
  resetE2eState(apiDir);
}
