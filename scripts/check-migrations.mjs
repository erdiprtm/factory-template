#!/usr/bin/env node
// Migration safety gate (expand/contract). See docs/DECISIONS.md D-010.
//
// Production applies migrations BEFORE the new code goes live, and auto-rollback only
// reverts code. So every migration must keep the previous release working:
//   - Expand migrations (add table, add nullable column, add column with DEFAULT,
//     add index, backfill UPDATE) are always allowed.
//   - Destructive statements (DROP TABLE/COLUMN/VIEW, RENAME, DELETE FROM, ADD COLUMN
//     NOT NULL without DEFAULT) are "contract" migrations. They must carry the marker
//     `-- migration: contract` and ship in a PR that changes nothing but migrations,
//     after the code that stopped using the old schema is already in production.
//   - Migrations that are already merged are immutable: never edit, rename or delete them.
//
// Usage:
//   node scripts/check-migrations.mjs [--base <git-ref>] [--dir <path>]...
// Without --base, scans every migration in the dirs. With --base (CI), checks only the
// migrations added or touched since the merge base with <git-ref>.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_DIRS = ["packages/db/migrations"];
const CONTRACT_MARKER = /^--\s*migration:\s*contract\b/im;
// Files a contract PR may change besides the migrations themselves.
const CONTRACT_PR_EXTRA = [/^docs\//, /\.md$/];

const RULES = [
  { name: "DROP TABLE", test: (s) => /\bDROP\s+TABLE\b/.test(s) },
  { name: "DROP COLUMN", test: (s) => /\bDROP\s+COLUMN\b/.test(s) },
  { name: "DROP VIEW", test: (s) => /\bDROP\s+VIEW\b/.test(s) },
  { name: "RENAME", test: (s) => /\bRENAME\s+(TO|COLUMN)\b/.test(s) },
  { name: "DELETE FROM", test: (s) => /\bDELETE\s+FROM\b/.test(s) },
  {
    name: "ADD COLUMN NOT NULL without DEFAULT",
    test: (s) => /^ALTER TABLE\b.*\bADD\b.*\bNOT NULL\b/.test(s) && !/\bDEFAULT\b/.test(s),
  },
];

function parseArgs(argv) {
  const args = { base: undefined, dirs: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base") args.base = argv[++i];
    else if (argv[i] === "--dir") args.dirs.push(argv[++i].replace(/\/+$/, ""));
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (args.dirs.length === 0) args.dirs = DEFAULT_DIRS;
  return args;
}

function statements(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .split(";")
    .map((s) => s.replace(/\s+/g, " ").trim().toUpperCase())
    .filter(Boolean);
}

export function analyze(sql) {
  const hits = new Set();
  for (const stmt of statements(sql)) {
    for (const rule of RULES) if (rule.test(stmt)) hits.add(rule.name);
  }
  return { destructive: [...hits], contract: CONTRACT_MARKER.test(sql) };
}

const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();
const inDirs = (file, dirs) => dirs.some((d) => file.startsWith(`${d}/`));
const isSql = (file) => file.endsWith(".sql");

function main() {
  const { base, dirs } = parseArgs(process.argv.slice(2));
  const errors = [];
  const toAnalyze = [];
  const changedFiles = [];

  if (base) {
    const mergeBase = git("merge-base", base, "HEAD");
    const lines = git("diff", "--name-status", "--no-renames", mergeBase, "HEAD").split("\n").filter(Boolean);
    for (const line of lines) {
      const [status, file] = line.split("\t");
      changedFiles.push(file);
      if (!inDirs(file, dirs) || !isSql(file)) continue;
      if (status === "A") toAnalyze.push(file);
      else errors.push(`${file}: merged migrations are immutable (status ${status}). Add a new migration instead.`);
    }
  } else {
    for (const dir of dirs) {
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir).sort()) if (isSql(f)) toAnalyze.push(join(dir, f));
    }
  }

  const contractFiles = [];
  for (const file of toAnalyze) {
    const { destructive, contract } = analyze(readFileSync(file, "utf8"));
    if (destructive.length === 0) continue;
    if (!contract) {
      errors.push(
        `${file}: destructive statement(s) ${destructive.join(", ")} without "-- migration: contract".\n` +
          "    Use expand/contract: add the new shape first, ship code that stops using the old one,\n" +
          "    then drop it later in a migration-only PR marked `-- migration: contract`.",
      );
    } else {
      contractFiles.push(file);
    }
  }

  if (base && contractFiles.length > 0) {
    const other = changedFiles.filter((f) => !inDirs(f, dirs) && !CONTRACT_PR_EXTRA.some((re) => re.test(f)));
    if (other.length > 0) {
      errors.push(
        `Contract migration(s) ${contractFiles.join(", ")} must ship alone, but this PR also changes:\n` +
          other.map((f) => `    - ${f}`).join("\n"),
      );
    }
  }

  if (errors.length > 0) {
    console.error(`Migration safety check FAILED:\n- ${errors.join("\n- ")}`);
    process.exit(1);
  }
  const scope = base ? `changes since ${base}` : dirs.join(", ");
  console.log(
    `Migration safety check passed (${toAnalyze.length} migration(s) checked in ${scope}` +
      (contractFiles.length ? `; contract: ${contractFiles.join(", ")}` : "") +
      ").",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
