#!/usr/bin/env node
// Validates a product spec (docs/SPEC_TEMPLATE.md). /build-from-spec refuses to start unless it passes.
// Usage: node scripts/spec-check.mjs specs/<slug>.md   → exit 1 with what's missing.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Splits a Markdown spec into { "Section title": "body" } by `## ` headings. */
export function sections(markdown) {
  const out = {};
  let current = null;
  for (const line of markdown.split("\n")) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) {
      current = h[1];
      out[current] = "";
    } else if (current) {
      out[current] += `${line}\n`;
    }
  }
  return out;
}

const filled = (text) =>
  (text ?? "")
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*]|\d+\.)\s*/, "").trim())
    .some((l) => l.length > 0 && l !== "…" && !/^<.*>$/.test(l) && !/:\s*…?$/.test(l));

const find = (secs, prefix) => Object.keys(secs).find((k) => k.toLowerCase().startsWith(prefix.toLowerCase()));

/** Returns the list of problems; empty means the spec is buildable. */
export function checkSpec(markdown) {
  const secs = sections(markdown);
  const problems = [];
  const title = markdown.match(/^#\s+(.+?)\s+—\s+Spec v\d+/m);
  if (!title) problems.push('Title must look like "# <Product name> — Spec v<n>"');

  for (const name of ["Core features", "Paid vs free", "Data the product stores"]) {
    const key = find(secs, name);
    if (!key || !filled(secs[key])) problems.push(`Section "${name}" is missing or empty`);
  }
  const core = find(secs, "Core features");
  if (core) {
    const n = secs[core].split("\n").filter((l) => /^\s*\d+\.\s+\S/.test(l) && !/^\s*\d+\.\s+…\s*$/.test(l)).length;
    if (n > 3) problems.push(`Core features: at most 3 in v1 (found ${n})`);
  }
  const launch = find(secs, "Launch");
  const kill = launch ? secs[launch].match(/Kill criteria[^:]*:\s*(.*)/i) : null;
  if (!kill || !kill[1].trim() || kill[1].trim() === "…")
    problems.push('"Kill criteria" (under Launch & distribution) is missing or empty');
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node scripts/spec-check.mjs specs/<slug>.md");
    process.exit(2);
  }
  const problems = checkSpec(readFileSync(file, "utf8"));
  if (problems.length) {
    console.error(`Spec ${file} is not ready:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`Spec ${file} is complete.`);
}
