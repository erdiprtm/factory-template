import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { E2E_LOCK, E2E_STATE, resetE2eState, takeE2eLock } from "./e2e-state.mjs";

describe("e2e-state (a fresh local D1 per E2E run, D-064)", () => {
  it("empties E2E's own state and leaves pnpm dev's .wrangler/state alone", () => {
    const api = mkdtempSync(join(tmpdir(), "e2e-state-"));
    const e2e = join(api, E2E_STATE, "v3/d1");
    const dev = join(api, ".wrangler/state/v3/d1");
    for (const dir of [e2e, dev]) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "db.sqlite"), "counters");
    }
    expect(resetE2eState(api)).toBe(join(api, ".wrangler/e2e"));
    expect(existsSync(join(api, E2E_STATE))).toBe(false);
    expect(existsSync(join(dev, "db.sqlite"))).toBe(true);
    // A first run, with nothing there yet, is fine too.
    expect(() => resetE2eState(api)).not.toThrow();
  });

  it("one run at a time: a live holder stops the next run; a dead one's lock is taken over (D-090)", () => {
    const api = mkdtempSync(join(tmpdir(), "e2e-lock-"));
    const live = new Set([111]);
    const isAlive = (pid) => live.has(pid);
    expect(takeE2eLock(api, 111, isAlive)).toBeNull();
    expect(readFileSync(join(api, E2E_LOCK), "utf8").trim()).toBe("111");
    expect(takeE2eLock(api, 222, isAlive)).toBe(111);
    expect(readFileSync(join(api, E2E_LOCK), "utf8").trim()).toBe("111");
    live.delete(111); // the old run ended (or was killed)
    expect(takeE2eLock(api, 222, isAlive)).toBeNull();
    expect(readFileSync(join(api, E2E_LOCK), "utf8").trim()).toBe("222");
  });

  it("the script refuses with a clear message while another run holds the lock", () => {
    const api = join(import.meta.dirname, "../apps/api");
    const lock = join(api, E2E_LOCK);
    let before = null;
    try {
      before = readFileSync(lock, "utf8");
    } catch {}
    // Another run's shell: a live process that isn't this script's parent.
    const other = spawn("sleep", ["30"]);
    writeFileSync(lock, `${other.pid}\n`);
    try {
      const r = spawnSync(process.execPath, [join(import.meta.dirname, "e2e-state.mjs")], { encoding: "utf8" });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(`Another E2E run is in progress (PID ${other.pid})`);
    } finally {
      other.kill();
      if (before === null) rmSync(lock, { force: true });
      else writeFileSync(lock, before);
    }
  });
});
