// What a change needs from CI (D-102, D-104), from its list of changed files:
//   docs  docs/**, specs/** and Markdown outside apps/site: no verify, preview or deploy;
//   site  only apps/site/** (plus docs): the site's checks and build, no app E2E; deploys the site only;
//   full  anything else, and an empty list: everything, as before.
// The site imports packages/** and product.config.ts, so a change there is `full`, never `site`.
//
// Usage: git diff --name-only A B | node scripts/ci-scope.mjs   → prints docs, site or full
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const isSite = (f) => f.startsWith("apps/site/");
const isDocs = (f) =>
  !isSite(f) && (f.startsWith("docs/") || f.startsWith("specs/") || f.toLowerCase().endsWith(".md"));

/** "docs" | "site" | "full" for a list of changed paths. */
export function ciScope(files) {
  const list = files.map((f) => f.trim()).filter(Boolean);
  if (list.length === 0) return "full"; // nothing to judge: run everything
  if (list.every(isDocs)) return "docs";
  if (list.every((f) => isDocs(f) || isSite(f))) return "site";
  return "full";
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(ciScope(readFileSync(0, "utf8").split("\n")));
}
