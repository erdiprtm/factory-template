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

/** Applies base..ref of the template onto the working tree (index too). Returns conflicted paths. */
export function templateSync({ cwd = process.cwd(), ref = "template/main", fetch = true } = {}) {
  const versionFile = `${cwd}/.template-version`;
  if (!existsSync(versionFile))
    throw new Error(
      ".template-version is missing. Write the template commit this repo last synced from into it (the sync PR's notes or STATUS name it), then rerun.",
    );
  const base = readFileSync(versionFile, "utf8").trim();
  if (fetch) git(["fetch", "template"], { cwd, stdio: ["ignore", "ignore", "inherit"] });
  const target = git(["rev-parse", ref], { cwd }).trim();
  if (target === base) return { base, target, conflicts: [], upToDate: true };
  const patch = git(["diff", "--binary", base, target], { cwd, maxBuffer: 256 * 1024 * 1024 });
  let conflicts = [];
  try {
    git(["apply", "--3way", "--index", "--whitespace=nowarn"], { cwd, input: patch, stdio: ["pipe", "pipe", "pipe"] });
  } catch {
    // Applied with conflict markers where both sides changed the same lines.
    conflicts = git(["diff", "--name-only", "--diff-filter=U"], { cwd }).split("\n").filter(Boolean);
  }
  writeFileSync(versionFile, `${target}\n`);
  return { base, target, conflicts, upToDate: false };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = templateSync({ ref: process.argv[2] ?? "template/main" });
  if (r.upToDate) console.log(`Already at template ${r.target.slice(0, 7)}.`);
  else {
    console.log(`Applied template ${r.base.slice(0, 7)}..${r.target.slice(0, 7)}; .template-version updated.`);
    if (r.conflicts.length > 0) {
      console.log(
        `Resolve these by the ownership rule (docs/TEMPLATE_SYNC.md), then git add them:\n- ${r.conflicts.join("\n- ")}`,
      );
      process.exit(2);
    }
  }
}
