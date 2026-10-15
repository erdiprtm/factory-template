#!/usr/bin/env node
// Pulls template changes into a product repo without a shared history (D-061).
// "Create from template" and squash-merged syncs leave the product with no common ancestor, so a
// plain `git merge` sees every file as added on both sides. Instead: apply the template's diff
// since the commit this repo last synced (.template-version) with a 3-way apply, which marks real
// conflicts the usual way, then record the new template commit.
//
// Usage (in a product repo, on a fresh branch): node scripts/template-sync.mjs [template-ref]
//   template-ref defaults to template/main (git remote "template").
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const git = (args, opts = {}) => execFileSync("git", args, { encoding: "utf8", ...opts });

/**
 * Files the product owns although the template edits its own copy (D-088): a sync never applies the
 * template's changes to them. STATUS is each repo's own progress log; applying the template's
 * entries only produced conflicts the product always resolved by keeping its own file.
 */
export const PRODUCT_OWNED = ["docs/STATUS.md"];

/** Paths git apply refused because the product already moved or removed them (or added them itself). */
const MISSING =
  /^error: (.+?): (does not exist in index|already exists in index|already exists in working directory|No such file or directory)$/gm;

/**
 * Applies base..ref of the template onto the working tree (index too). Returns conflicted paths,
 * and `manual`: paths it had to leave out because the product already renamed, removed or added
 * them (D-070). Throws, leaving .template-version alone, when nothing could be applied.
 */
export function templateSync({ cwd = process.cwd(), ref = "template/main", fetch = true } = {}) {
  const versionFile = `${cwd}/.template-version`;
  if (!existsSync(versionFile))
    throw new Error(
      ".template-version is missing. Write the template commit this repo last synced from into it (the sync PR's notes or STATUS name it), then rerun.",
    );
  const base = readFileSync(versionFile, "utf8").trim();
  if (fetch) git(["fetch", "template"], { cwd, stdio: ["ignore", "ignore", "inherit"] });
  const target = git(["rev-parse", ref], { cwd }).trim();
  if (target === base) return { base, target, conflicts: [], manual: [], skipped: [], upToDate: true };
  // --no-renames: a template rename is "delete old + add new", so a product that already made the
  // move only skips those two paths instead of failing the whole patch.
  const patch = git(["diff", "--binary", "--no-renames", base, target], { cwd, maxBuffer: 256 * 1024 * 1024 });
  if (patch.trim() === "") return { base, target, conflicts: [], manual: [], skipped: [], upToDate: true };

  const touched = git(["diff", "--name-only", "--no-renames", base, target], { cwd }).split("\n").filter(Boolean);
  const skipped = PRODUCT_OWNED.filter((p) => touched.includes(p));
  // Only product-owned files changed in this range: nothing to apply, and that's fine.
  if (touched.every((p) => skipped.includes(p))) {
    writeFileSync(versionFile, `${target}\n`);
    return { base, target, conflicts: [], manual: [], skipped, upToDate: false };
  }
  const manual = [];
  let conflicts = [];
  // git apply is all or nothing: one path it can't place stops every file. Leave such paths out,
  // list them for the human, and retry with the rest.
  for (;;) {
    // --exclude takes a glob: escape it, or "[slug].astro" would be a character class.
    const exclude = [...skipped, ...manual].map((p) => `--exclude=${p.replace(/[[\]*?\\]/g, "\\$&")}`);
    try {
      git(["apply", "--3way", "--index", "--whitespace=nowarn", ...exclude], {
        cwd,
        input: patch,
        stdio: ["pipe", "pipe", "pipe"],
      });
      break;
    } catch (err) {
      conflicts = git(["diff", "--name-only", "--diff-filter=U"], { cwd }).split("\n").filter(Boolean);
      // Applied, with conflict markers where both sides changed the same lines.
      if (conflicts.length > 0) break;
      const stderr = String(err.stderr ?? err.message);
      const missing = [...stderr.matchAll(MISSING)].map((m) => m[1]).filter((p) => !manual.includes(p));
      if (missing.length === 0)
        throw new Error(`git apply failed and nothing was applied; .template-version unchanged.\n${stderr.trim()}`);
      manual.push(...missing);
    }
  }
  const staged = git(["diff", "--cached", "--name-only"], { cwd }).trim();
  if (staged === "" && conflicts.length === 0)
    throw new Error(
      `Nothing from template ${base.slice(0, 7)}..${target.slice(0, 7)} was applied (the patch isn't empty); .template-version unchanged.${manual.length > 0 ? `\nLeft out: ${manual.join(", ")}` : ""}`,
    );
  writeFileSync(versionFile, `${target}\n`);
  return { base, target, conflicts, manual: manual.sort(), skipped, upToDate: false };
}

/** What to do with a path left out: take the template's file, or delete it if the template did. */
export function manualStep(cwd, target, path) {
  try {
    git(["cat-file", "-e", `${target}:${path}`], { cwd, stdio: "ignore" });
    return `${path}: take the template's version unless the product owns it: git show ${target.slice(0, 7)}:${JSON.stringify(path)} > ${JSON.stringify(path)}`;
  } catch {
    return `${path}: the template removed it; delete it here too if it's still the template's`;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let r;
  try {
    r = templateSync({ ref: process.argv[2] ?? "template/main" });
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
  if (r.upToDate) console.log(`Already at template ${r.target.slice(0, 7)}.`);
  else {
    console.log(`Applied template ${r.base.slice(0, 7)}..${r.target.slice(0, 7)}; .template-version updated.`);
    for (const p of r.skipped) console.log(`skipped: ${p} (product-owned)`);
    if (r.conflicts.length > 0)
      console.log(
        `Resolve these by the ownership rule (docs/TEMPLATE_SYNC.md), then git add them:\n- ${r.conflicts.join("\n- ")}`,
      );
    if (r.manual.length > 0)
      console.log(
        `Left out (the product already moved, removed or added them). Apply by hand:\n- ${r.manual.map((p) => manualStep(process.cwd(), r.target, p)).join("\n- ")}`,
      );
    if (r.conflicts.length > 0 || r.manual.length > 0) process.exit(2);
  }
}
