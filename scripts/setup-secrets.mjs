#!/usr/bin/env node
// Sets a repo's shared GitHub Actions secrets in one command (D-066), so a new product repo
// needs no token pasted by hand. Run on the human's machine:
//
//   pnpm setup-secrets [--repo owner/name] [--dry-run] [--only NAME,NAME]
//
// - Values come from ~/.config/factory/.env.shared only, never from a file inside the repo.
// - Names come from factory.secrets.json (committed): only allowlisted names are ever set,
//   whatever else .env.shared holds.
// - Each value goes to `gh secret set` on stdin: never in argv, never printed (D-027).
// - Exits 1 when an allowlisted (and selected) secret is missing or could not be set, 2 on bad usage.
// docs/SECRETS.md explains which secrets belong in .env.shared and how to rotate them.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const ALLOWLIST_FILE = "factory.secrets.json";
export const SHARED_ENV_DISPLAY = "~/.config/factory/.env.shared";
export const sharedEnvPath = (home = homedir()) => join(home, ".config", "factory", ".env.shared");

/** GitHub's rules for secret names: letters, digits and _, not starting with a digit or GITHUB_. */
const SECRET_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

export class UsageError extends Error {}

const USAGE = `Usage: pnpm setup-secrets [--repo owner/name] [--dry-run] [--only NAME,NAME]

Sets the GitHub Actions secrets named in ${ALLOWLIST_FILE} from ${SHARED_ENV_DISPLAY}.
  --repo owner/name   target this repo instead of the current one
  --dry-run           show which names would be set or are missing; change nothing
  --only NAME,NAME    set only these allowlisted names
See docs/SECRETS.md.`;

/**
 * Parses a dotenv-style file: `NAME=value`, optional `export `, `#` comments, blank lines,
 * 'single' (literal) or "double" (\n \" \\ escapes) quotes, and ` #` comments after unquoted values.
 * Bad lines are reported by line number only: their text may hold a secret.
 */
export function parseEnv(text) {
  const values = {};
  const invalidLines = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) return;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) {
      invalidLines.push(i + 1);
      return;
    }
    const [, name, rest] = m;
    let value;
    if (rest.startsWith('"') || rest.startsWith("'")) {
      const q = rest[0];
      const end = q === '"' ? closingDoubleQuote(rest) : rest.indexOf("'", 1);
      const after = end === -1 ? "" : rest.slice(end + 1).trim();
      if (end === -1 || (after !== "" && !after.startsWith("#"))) {
        invalidLines.push(i + 1);
        return;
      }
      value = rest.slice(1, end);
      if (q === '"') value = value.replace(/\\([n"\\])/g, (_, c) => (c === "n" ? "\n" : c));
    } else {
      value = rest.replace(/\s+#.*$/, "").trim();
    }
    values[name] = value;
  });
  return { values, invalidLines };
}

function closingDoubleQuote(s) {
  for (let i = 1; i < s.length; i++) {
    if (s[i] === "\\") i++;
    else if (s[i] === '"') return i;
  }
  return -1;
}

/** Reads factory.secrets.json: a JSON array of unique secret names. */
export function parseAllowlist(text) {
  let names;
  try {
    names = JSON.parse(text);
  } catch {
    throw new Error(`${ALLOWLIST_FILE} is not valid JSON. Expected e.g. ["CLOUDFLARE_API_TOKEN"].`);
  }
  if (!Array.isArray(names) || !names.every((n) => typeof n === "string")) {
    throw new Error(`${ALLOWLIST_FILE} must be a JSON array of secret names, e.g. ["CLOUDFLARE_API_TOKEN"].`);
  }
  const bad = names.filter((n) => !SECRET_NAME.test(n) || /^GITHUB_/i.test(n));
  if (bad.length) {
    throw new Error(
      `${ALLOWLIST_FILE}: not valid GitHub secret names: ${bad.join(", ")} (letters, digits, _; no GITHUB_ prefix).`,
    );
  }
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  if (dupes.length) throw new Error(`${ALLOWLIST_FILE}: listed twice: ${[...new Set(dupes)].join(", ")}.`);
  return names;
}

export function parseArgs(argv) {
  const a = { repo: null, dryRun: false, only: null, help: false };
  const args = argv[0] === "--" ? argv.slice(1) : argv; // `pnpm setup-secrets -- --dry-run`
  for (let i = 0; i < args.length; i++) {
    const [flag, inline] = args[i].startsWith("--") ? args[i].split(/=(.*)/s, 2) : [args[i]];
    const value = () => {
      const v = inline ?? args[++i];
      if (v === undefined || v === "" || v.startsWith("--")) throw new UsageError(`${flag} needs a value.`);
      return v;
    };
    if (flag === "--repo") a.repo = value();
    else if (flag === "--only") {
      a.only = [
        ...new Set(
          value()
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      ];
      if (a.only.length === 0) throw new UsageError("--only needs at least one name.");
    } else if (flag === "--dry-run" && inline === undefined) a.dryRun = true;
    else if ((flag === "--help" || flag === "-h") && inline === undefined) a.help = true;
    else throw new UsageError(`Unknown argument: ${args[i]}`);
  }
  if (a.repo !== null && !REPO.test(a.repo)) throw new UsageError(`--repo must look like owner/name, got "${a.repo}".`);
  return a;
}

/**
 * Which allowlisted names to set. `skipped`: allowlisted but left out by --only. `missing`: selected
 * but absent or empty in .env.shared. `ignored`: how many other names .env.shared holds (never set).
 */
export function planSecrets({ allowlist, values, only = null }) {
  if (only) {
    const unknown = only.filter((n) => !allowlist.includes(n));
    if (unknown.length) {
      throw new UsageError(
        `--only names not in ${ALLOWLIST_FILE}: ${unknown.join(", ")}. Allowed: ${allowlist.join(", ")}.`,
      );
    }
  }
  const selected = only ? allowlist.filter((n) => only.includes(n)) : allowlist;
  const has = (n) => Object.hasOwn(values, n) && values[n] !== "";
  return {
    toSet: selected.filter(has),
    missing: selected.filter((n) => !has(n)),
    skipped: allowlist.filter((n) => !selected.includes(n)),
    ignored: Object.keys(values).filter((n) => !allowlist.includes(n)).length,
  };
}

/** Removes every secret value from text that is about to be printed (e.g. gh's error output). */
export function redact(text, values) {
  let out = text;
  for (const v of Object.values(values)) if (v.length >= 4) out = out.split(v).join("***");
  return out;
}

/** True when `path` (resolving symlinks) lies inside `dir`. */
function isInside(path, dir) {
  const rel = relative(realpathSync(dir), realpathSync(path));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

const defaultGh = (args, { input } = {}) =>
  spawnSync("gh", args, { encoding: "utf8", input: input ?? "", stdio: ["pipe", "pipe", "pipe"] });

/**
 * Checks everything the run needs and returns the problems, each with how to fix it.
 * Resolves the target repo too (needs gh), unless --repo was given.
 */
export function preflight({ args, gh, envPath, repoRoot }) {
  const problems = [];
  let repo = args.repo;
  const version = gh(["--version"]);
  if (version.error || version.status !== 0) {
    problems.push(
      "GitHub CLI (gh) is not installed.\n    Fix: install it from https://cli.github.com (macOS: brew install gh), then run: gh auth login",
    );
  } else if (gh(["auth", "status"]).status !== 0) {
    problems.push("GitHub CLI is not logged in.\n    Fix: gh auth login   (then check with: gh auth status)");
  } else if (!repo) {
    const view = gh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]);
    repo = view.status === 0 ? view.stdout.trim() : "";
    if (!REPO.test(repo)) {
      repo = null;
      problems.push(
        "Could not tell which GitHub repo this folder belongs to.\n    Fix: run it inside the product's clone, or pass --repo owner/name",
      );
    }
  }
  if (!existsSync(envPath)) {
    problems.push(
      `${SHARED_ENV_DISPLAY} does not exist.\n    Fix: mkdir -p ~/.config/factory && touch ${SHARED_ENV_DISPLAY} && chmod 600 ${SHARED_ENV_DISPLAY}\n    then add one NAME=value line per shared secret (docs/SECRETS.md).`,
    );
  } else if (isInside(envPath, repoRoot)) {
    problems.push(`${envPath} is inside this repo. Shared secrets must live outside any repo (docs/SECRETS.md).`);
  }
  if (!existsSync(join(repoRoot, ALLOWLIST_FILE))) {
    problems.push(
      `${ALLOWLIST_FILE} is missing from ${repoRoot}.\n    Fix: pull the template's latest version (/sync-template).`,
    );
  }
  return { problems, repo };
}

/** Runs the command. Returns the exit code; never prints a secret value. */
export function setupSecrets(
  argv,
  {
    gh = defaultGh,
    envPath = sharedEnvPath(),
    repoRoot = fileURLToPath(new URL("..", import.meta.url)),
    log = console.log,
    error = console.error,
    platform = process.platform,
  } = {},
) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    error(`${e.message}\n\n${USAGE}`);
    return 2;
  }
  if (args.help) {
    log(USAGE);
    return 0;
  }

  const { problems, repo } = preflight({ args, gh, envPath, repoRoot });
  if (problems.length) {
    error(`Cannot set secrets yet:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    return 1;
  }

  let allowlist;
  try {
    allowlist = parseAllowlist(readFileSync(join(repoRoot, ALLOWLIST_FILE), "utf8"));
  } catch (e) {
    error(e.message);
    return 1;
  }
  const { values, invalidLines } = parseEnv(readFileSync(envPath, "utf8"));
  if (invalidLines.length) {
    error(`${SHARED_ENV_DISPLAY}: ignoring unreadable line(s) ${invalidLines.join(", ")} (expected NAME=value).`);
  }
  if (platform !== "win32" && (statSync(envPath).mode & 0o077) !== 0) {
    error(`Warning: other users can read ${SHARED_ENV_DISPLAY}. Fix: chmod 600 ${SHARED_ENV_DISPLAY}`);
  }

  let plan;
  try {
    plan = planSecrets({ allowlist, values, only: args.only });
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    error(e.message);
    return 2;
  }

  log(`${args.dryRun ? "DRY RUN (nothing is changed): " : ""}secrets for ${repo}`);
  const set = [];
  const failed = [];
  for (const name of plan.toSet) {
    if (args.dryRun) {
      log(`  would set  ${name}`);
      set.push(name);
      continue;
    }
    const r = gh(["secret", "set", name, "--repo", repo], { input: values[name] });
    if (!r.error && r.status === 0) {
      log(`  set        ${name}`);
      set.push(name);
    } else {
      const why = redact(`${r.stderr ?? ""}${r.error?.message ?? ""}`, values)
        .trim()
        .split("\n")[0];
      log(`  FAILED     ${name}${why ? `: ${why}` : ""}`);
      failed.push(name);
    }
  }
  for (const name of plan.missing) log(`  missing    ${name}`);

  const list = (names) => (names.length ? names.join(", ") : "-");
  log(`\nSummary for ${repo}${args.dryRun ? " (dry run)" : ""}:`);
  log(`  ${args.dryRun ? "would set" : "set"}: ${list(set)}`);
  log(`  skipped: ${list(plan.skipped)}${plan.skipped.length ? " (not in --only)" : ""}`);
  log(`  missing: ${list(plan.missing)}${plan.missing.length ? ` (add them to ${SHARED_ENV_DISPLAY})` : ""}`);
  if (failed.length) log(`  failed: ${list(failed)}`);
  if (plan.ignored)
    log(`  (${plan.ignored} other name(s) in ${SHARED_ENV_DISPLAY} are not in ${ALLOWLIST_FILE}: not set)`);
  return plan.missing.length || failed.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = setupSecrets(process.argv.slice(2));
}
