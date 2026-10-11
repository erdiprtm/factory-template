import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { analyze } from "./check-migrations.mjs";

const SCRIPT = join(import.meta.dirname, "check-migrations.mjs");
const MIG = "packages/db/migrations";
let repo;

const git = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8" });
const write = (file, text) => {
  mkdirSync(join(repo, file, ".."), { recursive: true });
  writeFileSync(join(repo, file), text);
};
const commit = (msg) => {
  git("add", "-A");
  git("commit", "-qm", msg);
};
const check = (...args) => spawnSync("node", [SCRIPT, ...args], { cwd: repo, encoding: "utf8" });

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "mig-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  write(`${MIG}/0000_init.sql`, "CREATE TABLE payments (id TEXT PRIMARY KEY, address TEXT NOT NULL);\n");
  write("apps/api/a.ts", "x\n");
  commit("init");
  git("checkout", "-qb", "feature");
});

describe("analyze", () => {
  it("allows expand statements", () => {
    const sql = "ALTER TABLE p ADD COLUMN note TEXT;\nALTER TABLE p ADD COLUMN n INTEGER NOT NULL DEFAULT 0;";
    expect(analyze(sql).destructive).toEqual([]);
  });
  it("flags destructive statements and reads the contract marker", () => {
    expect(analyze("ALTER TABLE p DROP COLUMN a;").destructive).toEqual(["DROP COLUMN"]);
    expect(analyze("ALTER TABLE p ADD COLUMN e TEXT NOT NULL;").destructive).toEqual([
      "ADD COLUMN NOT NULL without DEFAULT",
    ]);
    expect(analyze("-- migration: contract\nDROP TABLE x;")).toEqual({ destructive: ["DROP TABLE"], contract: true });
  });
  it("ignores keywords inside comments", () => {
    expect(analyze("-- we will DROP TABLE later\nCREATE INDEX i ON p(id);").destructive).toEqual([]);
  });
});

describe("check-migrations --base", () => {
  it("passes an expand migration shipped with code", () => {
    write(`${MIG}/0001_expand.sql`, "ALTER TABLE payments ADD COLUMN note TEXT;\n");
    write("apps/api/a.ts", "y\n");
    commit("expand");
    expect(check("--base", "main").status).toBe(0);
  });
  it("fails an unmarked destructive migration", () => {
    write(`${MIG}/0001_drop.sql`, "ALTER TABLE payments DROP COLUMN address;\n");
    commit("drop");
    const r = check("--base", "main");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/without "-- migration: contract"/);
  });
  it("fails a contract migration mixed with code", () => {
    write(`${MIG}/0001_contract.sql`, "-- migration: contract\nALTER TABLE payments DROP COLUMN address;\n");
    write("apps/api/a.ts", "z\n");
    commit("mixed");
    const r = check("--base", "main");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/must ship alone/);
  });
  it("passes a contract migration shipped alone (docs allowed)", () => {
    write(`${MIG}/0001_contract.sql`, "-- migration: contract\nALTER TABLE payments DROP COLUMN address;\n");
    write("docs/notes.md", "why\n");
    commit("contract");
    expect(check("--base", "main").status).toBe(0);
  });
  it("fails when a merged migration is edited", () => {
    write(`${MIG}/0000_init.sql`, "CREATE TABLE payments (id TEXT PRIMARY KEY);\n");
    commit("edit");
    const r = check("--base", "main");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/immutable/);
  });
});
