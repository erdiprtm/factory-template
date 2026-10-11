#!/usr/bin/env node
// Post-deploy smoke test. Runs the checks in scripts/smoke-checks.json against a
// deployed URL, retrying the whole suite while the new version propagates.
//
// Usage: node scripts/smoke-test.mjs <base-url> [--expect-commit <sha>] [--attempts 10] [--delay-ms 3000]
//                                   [--checks scripts/smoke-checks.site.json]
//
// Each check: { name, path, status: number[], json?: object (subset match),
//               contentType?: string (prefix), commitField?: string }
// `commitField` makes the check compare that JSON field to --expect-commit, which
// proves the new version is the one answering. Exit code 1 if any check fails.

import { readFile } from "node:fs/promises";

function parseArgs(argv) {
  const args = { attempts: 10, delayMs: 3000, expectCommit: undefined, baseUrl: undefined, checks: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--expect-commit") args.expectCommit = argv[++i];
    else if (a === "--attempts") args.attempts = Number(argv[++i]);
    else if (a === "--delay-ms") args.delayMs = Number(argv[++i]);
    else if (a === "--checks") args.checks = argv[++i];
    else if (!args.baseUrl) args.baseUrl = a;
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!args.baseUrl) throw new Error("Missing <base-url>");
  args.baseUrl = args.baseUrl.replace(/\/+$/, "");
  return args;
}

function isSubset(expected, actual) {
  if (expected === null || typeof expected !== "object") return expected === actual;
  if (actual === null || typeof actual !== "object") return false;
  return Object.entries(expected).every(([k, v]) => isSubset(v, actual[k]));
}

async function runCheck(check, { baseUrl, expectCommit }) {
  const url = `${baseUrl}${check.path}`;
  const res = await fetch(url, {
    redirect: "manual",
    headers: { "cache-control": "no-cache", "user-agent": "factory-smoke-test" },
    signal: AbortSignal.timeout(10_000),
  });
  const problems = [];
  if (!check.status.includes(res.status)) {
    problems.push(`status ${res.status}, expected ${check.status.join("|")}`);
  }
  const type = res.headers.get("content-type") ?? "";
  if (check.contentType && !type.startsWith(check.contentType)) {
    problems.push(`content-type "${type}", expected "${check.contentType}"`);
  }
  if (check.json || check.commitField) {
    let body;
    try {
      body = await res.json();
    } catch {
      problems.push("body is not JSON");
    }
    if (body !== undefined) {
      if (check.json && !isSubset(check.json, body)) {
        problems.push(`JSON ${JSON.stringify(body)} does not contain ${JSON.stringify(check.json)}`);
      }
      if (check.commitField && expectCommit && body[check.commitField] !== expectCommit) {
        problems.push(`${check.commitField}=${body[check.commitField]}, expected ${expectCommit}`);
      }
    }
  } else {
    await res.body?.cancel();
  }
  return problems;
}

async function runSuite(checks, opts) {
  const failures = [];
  for (const check of checks) {
    try {
      const problems = await runCheck(check, opts);
      if (problems.length) failures.push(`${check.name} (${check.path}): ${problems.join("; ")}`);
    } catch (err) {
      failures.push(`${check.name} (${check.path}): ${err.message}`);
    }
  }
  return failures;
}

const opts = parseArgs(process.argv.slice(2));
const checksFile = opts.checks
  ? new URL(opts.checks, `file://${process.cwd()}/`)
  : new URL("./smoke-checks.json", import.meta.url);
const checks = JSON.parse(await readFile(checksFile, "utf8"));

let failures = [];
for (let attempt = 1; attempt <= opts.attempts; attempt++) {
  failures = await runSuite(checks, opts);
  if (failures.length === 0) {
    console.log(`Smoke test passed: ${checks.length} checks against ${opts.baseUrl} (attempt ${attempt}).`);
    process.exit(0);
  }
  console.log(`Attempt ${attempt}/${opts.attempts} failed:\n  - ${failures.join("\n  - ")}`);
  if (attempt < opts.attempts) await new Promise((r) => setTimeout(r, opts.delayMs));
}
console.error(`Smoke test FAILED against ${opts.baseUrl}.`);
process.exit(1);
