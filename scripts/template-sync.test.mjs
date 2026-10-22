import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { manualStep, templateSync } from "./template-sync.mjs";

// Every case runs real git in a temp repo: on a loaded laptop (several verify runs at once, load
// over 100) some took over vitest's 5 s default (D-098). 30 s each; a real hang still fails.
vi.setConfig({ testTimeout: 30_000 });

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

  // D-070: Myna Fit had already moved pages/[slug].astro to pages/artikel/ when the template did the
  // same move. git apply is all or nothing, so the old script applied none of the 47 files and still
  // reported success and moved .template-version.
  function renamedByBoth() {
    const tpl = repo();
    write(tpl, "core.ts", "a = 1\n");
    write(tpl, "[slug].astro", "seo page\n");
    const v1 = commit(tpl, "v1");
    const prod = repo();
    write(prod, "core.ts", "a = 1\n");
    mkdirSync(join(prod, "artikel"));
    write(prod, "artikel/[slug].astro", "seo page (product)\n");
    write(prod, ".template-version", `${v1}\n`);
    commit(prod, "create from template, then move the page by hand");
    git(tpl, "mv", "[slug].astro", "artikel-slug.astro");
    write(tpl, "core.ts", "a = 2\n");
    write(tpl, "new.ts", "new\n");
    return { tpl, prod, v1 };
  }

  it("leaves out paths the product already moved, applies the rest, and names them for the human", () => {
    const { tpl, prod } = renamedByBoth();
    mkdirSync(join(tpl, "artikel"));
    git(tpl, "mv", "artikel-slug.astro", "artikel/[slug].astro");
    const v2 = commit(tpl, "v2: move the page");
    git(prod, "remote", "add", "template", tpl);
    git(prod, "fetch", "-q", "template");
    const r = templateSync({ cwd: prod, fetch: false });
    // The old path is gone here: left out and named. The new path exists on both sides: a normal
    // conflict to resolve by the ownership rule.
    expect(r.manual).toEqual(["[slug].astro"]);
    expect(r.conflicts).toEqual(["artikel/[slug].astro"]);
    expect(readFileSync(join(prod, "artikel/[slug].astro"), "utf8")).toMatch(/<<<<<<<[\s\S]*seo page \(product\)/);
    expect(readFileSync(join(prod, "core.ts"), "utf8")).toBe("a = 2\n");
    expect(readFileSync(join(prod, "new.ts"), "utf8")).toBe("new\n");
    expect(readFileSync(join(prod, ".template-version"), "utf8").trim()).toBe(v2);
    expect(manualStep(prod, v2, "artikel/[slug].astro")).toContain(`git show ${v2.slice(0, 7)}:"artikel/[slug].astro"`);
    expect(manualStep(prod, v2, "[slug].astro")).toContain("the template removed it");
  });

  it("fails without moving .template-version when nothing could be applied", () => {
    const tpl = repo();
    write(tpl, "only.ts", "x = 1\n");
    const v1 = commit(tpl, "v1");
    const prod = repo();
    write(prod, "other.ts", "product\n");
    write(prod, ".template-version", `${v1}\n`);
    commit(prod, "the product removed only.ts");
    write(tpl, "only.ts", "x = 2\n");
    commit(tpl, "v2");
    git(prod, "remote", "add", "template", tpl);
    git(prod, "fetch", "-q", "template");
    expect(() => templateSync({ cwd: prod, fetch: false })).toThrow(/Nothing from template .* was applied/);
    expect(readFileSync(join(prod, ".template-version"), "utf8").trim()).toBe(v1);
  });

  it("the command exits 2 and prints what to apply by hand", () => {
    const { tpl, prod } = renamedByBoth();
    mkdirSync(join(tpl, "artikel"));
    git(tpl, "mv", "artikel-slug.astro", "artikel/[slug].astro");
    commit(tpl, "v2");
    git(prod, "remote", "add", "template", tpl);
    const run = spawnSync(process.execPath, [join(import.meta.dirname, "template-sync.mjs")], {
      cwd: prod,
      encoding: "utf8",
    });
    expect(run.status).toBe(2);
    expect(run.stdout).toContain("Resolve these");
    expect(run.stdout).toContain("- artikel/[slug].astro");
    expect(run.stdout).toContain("Apply by hand");
    expect(run.stdout).toContain("- [slug].astro: the template removed it");
  });

  it("never applies the template's docs/STATUS.md to the product's own (D-088)", () => {
    const tpl = repo();
    mkdirSync(join(tpl, "docs"));
    write(tpl, "docs/STATUS.md", "# Status\n\n## template entry 1\n");
    write(tpl, "core.ts", "a = 1\n");
    const v1 = commit(tpl, "v1");
    const prod = repo();
    mkdirSync(join(prod, "docs"));
    write(prod, "docs/STATUS.md", "# Status\n\n## product entry\n");
    write(prod, "core.ts", "a = 1\n");
    write(prod, ".template-version", `${v1}\n`);
    commit(prod, "create");
    write(tpl, "docs/STATUS.md", "# Status\n\n## template entry 2\n\n## template entry 1\n");
    write(tpl, "core.ts", "a = 2\n");
    const v2 = commit(tpl, "v2");
    git(prod, "remote", "add", "template", tpl);
    git(prod, "fetch", "-q", "template");
    const r = templateSync({ cwd: prod, fetch: false });
    expect(r).toMatchObject({ conflicts: [], manual: [], skipped: ["docs/STATUS.md"] });
    expect(readFileSync(join(prod, "docs/STATUS.md"), "utf8")).toBe("# Status\n\n## product entry\n");
    expect(readFileSync(join(prod, "core.ts"), "utf8")).toBe("a = 2\n");
    expect(readFileSync(join(prod, ".template-version"), "utf8").trim()).toBe(v2);

    // A range that only touched STATUS still moves .template-version (nothing else to apply).
    write(tpl, "docs/STATUS.md", "# Status\n\n## template entry 3\n");
    const v3 = commit(tpl, "v3");
    git(prod, "fetch", "-q", "template");
    const only = templateSync({ cwd: prod, fetch: false });
    expect(only.skipped).toEqual(["docs/STATUS.md"]);
    expect(readFileSync(join(prod, ".template-version"), "utf8").trim()).toBe(v3);
  });

  it("refuses to guess without .template-version", () => {
    const prod = repo();
    write(prod, "a.ts", "x\n");
    commit(prod, "init");
    expect(() => templateSync({ cwd: prod, fetch: false })).toThrow(/template-version is missing/);
  });
});
