// Runs `vitest run` and retries once, narrowly, when the only problem was a test worker that never
// started because its connection was reset (D-089). On a busy laptop @cloudflare/vitest-plugin's
// workerd pool once failed to start for one file with `read ECONNRESET`: every test that ran passed,
// yet the task failed and `pnpm verify` stopped. Vitest has no retry for a worker start (test.retry
// only reruns a test that ran and failed), so this wrapper reruns just the files named in that error.
//
// It never retries a real failure: a failed test, any other error, or a second ECONNRESET keeps the
// exit code non-zero.
//
// Usage (apps/api package.json): node ../../scripts/vitest-pool-retry.mjs [vitest args...]
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

// biome-ignore lint/suspicious/noControlCharactersInRegex: strips terminal colors
const ANSI = /\u001b\[[0-9;]*m/g;
const START_FAILED = /\[vitest-pool\]: Failed to start \S+ worker for test files (.+?)\.?\s*$/gm;

/**
 * The files to rerun, or null when this run must not be retried. Only when a worker failed to start
 * with ECONNRESET, no test failed, and no other error was reported.
 */
export function filesToRetry(output) {
  const text = output.replace(ANSI, "");
  if (!/ECONNRESET/.test(text)) return null;
  const starts = [...text.matchAll(START_FAILED)];
  const files = [...new Set(starts.flatMap((m) => m[1].split(", ").map((f) => f.trim())))];
  if (files.length === 0) return null;
  if (/^\s*Tests\s+.*\bfailed\b/m.test(text)) return null; // a real failure: never retried
  // Vitest's summary counts every unhandled error; each start failure is one of them.
  const errors = Number(/^\s*Errors\s+(\d+) errors?/m.exec(text)?.[1] ?? 0);
  if (errors > starts.length) return null;
  // A file listed as FAIL must be one that never started.
  const failed = [...text.matchAll(/^\s*FAIL\s+(\S+)/gm)].map((m) => m[1]);
  if (failed.some((f) => !files.some((path) => path.endsWith(f)))) return null;
  return files;
}

function run(args) {
  return new Promise((resolve) => {
    const child = spawn("vitest", ["run", ...args], {
      stdio: ["inherit", "pipe", "pipe"],
      // Piped output loses the terminal's colors; keep them when a person is watching.
      env: process.stdout.isTTY && !process.env.FORCE_COLOR ? { ...process.env, FORCE_COLOR: "1" } : process.env,
    });
    let output = "";
    child.stdout.on("data", (d) => {
      output += d;
      process.stdout.write(d);
    });
    child.stderr.on("data", (d) => {
      output += d;
      process.stderr.write(d);
    });
    child.on("error", (error) => {
      console.error(error);
      resolve({ code: 1, output: "" });
    });
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2);
  const first = await run(args);
  const files = first.code === 0 ? null : filesToRetry(first.output);
  if (!files) process.exit(first.code);
  console.error(
    `\n[vitest-pool-retry] A test worker didn't start (ECONNRESET). Running once more: ${files.join(", ")}\n`,
  );
  const second = await run(files);
  process.exit(second.code);
}
