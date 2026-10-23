// Whether a change touches docs only (D-102), so CI can skip verify, the preview and the
// production deploy: GitHub Actions minutes are capped on private product repos. Docs = `docs/**`,
// `specs/**` and Markdown anywhere else, EXCEPT under apps/site/ (SEO pages, landers, legal text,
// Markdown pages are built into the site and must go through verify and a deploy).
//
// Usage: git diff --name-only A B | node scripts/docs-only.mjs   → prints "true" or "false"
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function isDocsOnly(files) {
  const list = files.map((f) => f.trim()).filter(Boolean);
  if (list.length === 0) return false; // nothing to judge: run everything
  return list.every(
    (f) =>
      !f.startsWith("apps/site/") &&
      (f.startsWith("docs/") || f.startsWith("specs/") || f.toLowerCase().endsWith(".md")),
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(String(isDocsOnly(readFileSync(0, "utf8").split("\n"))));
}
