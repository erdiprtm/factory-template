import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { holder, tryLock, unlock } from "./verify-lock.mjs";

// D-098: one verify at a time on the laptop; a dead holder's lock is taken over.
const fresh = () => join(mkdtempSync(join(tmpdir(), "vlock-")), "lock");

describe("verify lock", () => {
  it("one holder at a time; freed by its holder only", () => {
    const dir = fresh();
    expect(tryLock(dir, { pid: process.pid, cwd: "/a", startedAt: 1 })).toBe(true);
    expect(holder(dir)).toMatchObject({ pid: process.pid, cwd: "/a" });
    expect(tryLock(dir, { pid: process.pid, cwd: "/b", startedAt: 2 })).toBe(false);
    unlock(dir, 999_999_999);
    expect(existsSync(dir)).toBe(true);
    unlock(dir, process.pid);
    expect(existsSync(dir)).toBe(false);
  });

  it("takes over a lock whose holder died", async () => {
    const dir = fresh();
    const child = spawn(process.execPath, ["-e", ""]);
    const pid = child.pid;
    await new Promise((r) => child.on("exit", r));
    mkdirSync(dir);
    writeFileSync(join(dir, "owner.json"), JSON.stringify({ pid, cwd: "/gone", startedAt: 1 }));
    expect(holder(dir)).toBeNull();
    expect(tryLock(dir, { pid: process.pid, cwd: "/me", startedAt: 3 })).toBe(true);
    expect(holder(dir)?.cwd).toBe("/me");
  });

  it("leaves a lock that is being created right now", () => {
    const dir = fresh();
    mkdirSync(dir);
    expect(tryLock(dir, { pid: process.pid, cwd: "/me", startedAt: 4 })).toBe(false);
  });
});
