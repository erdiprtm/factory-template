// One `pnpm verify` at a time on this laptop (D-098). Several Claude sessions (the template, a
// product, its worktrees) ran verify at once: load passed 100, tests timed out and two E2E servers
// raced for one port. This waits for the running one, then runs the command and frees the lock.
//
// The lock is a directory in the OS temp dir (mkdir is atomic), shared by every factory repo for
// this user, with the holder's pid, folder and start time. A holder that died leaves a stale lock,
// which is taken over. CI (fresh machine per job) and VERIFY_LOCK=off skip it.
//
// Usage: node scripts/verify-lock.mjs <command> [args…]   (package.json "verify")
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const LOCK_DIR = join(tmpdir(), "factory-verify.lock");
const WAIT_MS = 2000;
const NOTE_EVERY_MS = 30_000;
const GIVE_UP_MS = 60 * 60_000;

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
};

/** The lock's holder, or null when it's free or its holder is gone. */
export function holder(dir = LOCK_DIR) {
  try {
    const h = JSON.parse(readFileSync(join(dir, "owner.json"), "utf8"));
    return Number.isInteger(h.pid) && alive(h.pid) ? h : null;
  } catch {
    return null;
  }
}

/** Takes the lock if it's free or stale; true when this process holds it now. */
export function tryLock(dir = LOCK_DIR, me = { pid: process.pid, cwd: process.cwd(), startedAt: Date.now() }) {
  try {
    mkdirSync(dir);
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    if (holder(dir)) return false;
    // No live holder. A lock without owner.json is either being created this instant (leave it) or
    // was left half-made long ago (take it over).
    const fresh = Date.now() - statSync(dir).mtimeMs < 10_000;
    if (fresh && !existsSync(join(dir, "owner.json"))) return false;
    rmSync(dir, { recursive: true, force: true });
    try {
      mkdirSync(dir);
    } catch {
      return false;
    }
  }
  writeFileSync(join(dir, "owner.json"), JSON.stringify(me));
  return true;
}

export function unlock(dir = LOCK_DIR, pid = process.pid) {
  try {
    if (JSON.parse(readFileSync(join(dir, "owner.json"), "utf8")).pid !== pid) return;
  } catch {
    return;
  }
  rmSync(dir, { recursive: true, force: true });
}

async function main(argv) {
  if (argv.length === 0) throw new Error("usage: node scripts/verify-lock.mjs <command> [args…]");
  const skip = process.env.CI || process.env.VERIFY_LOCK === "off";
  if (!skip) {
    const start = Date.now();
    let noted = -NOTE_EVERY_MS;
    while (!tryLock()) {
      const h = holder();
      const waited = Date.now() - start;
      if (waited > GIVE_UP_MS) throw new Error(`gave up after 60 min waiting for verify in ${h?.cwd ?? "?"}`);
      if (h && waited - noted >= NOTE_EVERY_MS) {
        const mins = Math.round((Date.now() - h.startedAt) / 60_000);
        console.error(
          `Waiting: pnpm verify is running in ${h.cwd} (pid ${h.pid}, ${mins} min). One at a time (D-098).`,
        );
        noted = waited;
      }
      await new Promise((r) => setTimeout(r, WAIT_MS));
    }
  }
  const child = spawn(argv[0], argv.slice(1), { stdio: "inherit", shell: false });
  const release = () => skip || unlock();
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"])
    process.on(sig, () => {
      child.kill(sig);
    });
  child.on("exit", (code, signal) => {
    release();
    process.exit(code ?? (signal ? 1 : 0));
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
