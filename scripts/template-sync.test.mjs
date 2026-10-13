import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { templateSync } from "./template-sync.mjs";

// D-061: a product with NO shared history gets exactly the template's changes since its last sync.
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" });
function repo() {
  const dir = mkdtempSync(join(tmpdir(), "tsync-"));
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "T");
  return dir;
}
const write = (dir, file, text) => writeFileSync(join(dir, file), text);
const commit = (dir, msg) => {
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", msg);
  return git(dir, "rev-parse", "HEAD").trim();
};

describe("template-sync", () => {
  it("applies only the template's changes since .template-version, and marks real conflicts", () => {
    const tpl = repo();
    write(tpl, "core.ts", "export const a = 1;\nexport const b = 2;\n");
    write(tpl, "shared.ts", "line 1\nline 2\n");
    const v1 = commit(tpl, "v1");

    // The product starts from v1's files with a fresh history (like "create from template").
    const prod = repo();
    write(prod, "core.ts", "export const a = 1;\nexport const b = 2;\n");
    write(prod, "shared.ts", "line 1 (product)\nline 2\n");
    write(prod, "feature.ts", "product only\n");
    write(prod, ".template-version", `${v1}\n`);
    commit(prod, "create from template");

    write(tpl, "core.ts", "export const a = 1;\nexport const b = 3;\n");
    write(tpl, "shared.ts", "line 1 (template)\nline 2\n");
    write(tpl, "new.ts", "new core file\n");
    const v2 = commit(tpl, "v2");

    git(prod, "remote", "add", "template", tpl);
    git(prod, "fetch", "-q", "template");
    const r = templateSync({ cwd: prod, fetch: false });
    expect(r).toMatchObject({ base: v1, target: v2, upToDate: false });
    expect(readFileSync(join(prod, "core.ts"), "utf8")).toContain("b = 3");
    expect(readFileSync(join(prod, "new.ts"), "utf8")).toBe("new core file\n");
    expect(readFileSync(join(prod, "feature.ts"), "utf8")).toBe("product only\n");
    expect(r.conflicts).toEqual(["shared.ts"]);
    expect(readFileSync(join(prod, "shared.ts"), "utf8")).toMatch(/<<<<<<<[\s\S]*line 1 \(template\)/);
    expect(readFileSync(join(prod, ".template-version"), "utf8").trim()).toBe(v2);

    // A second run is a no-op.
    expect(templateSync({ cwd: prod, fetch: false }).upToDate).toBe(true);
  });

  it("refuses to guess without .template-version", () => {
    const prod = repo();
    write(prod, "a.ts", "x\n");
    commit(prod, "init");
    expect(() => templateSync({ cwd: prod, fetch: false })).toThrow(/template-version is missing/);
  });
});
