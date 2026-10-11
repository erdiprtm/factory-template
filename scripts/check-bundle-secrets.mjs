#!/usr/bin/env node
// Fails if anything secret-looking ships to browsers (Phase 9). Scans the built client output:
// the app's web export and the static site. Run after `pnpm build` (part of `pnpm verify`).
// Usage: node scripts/check-bundle-secrets.mjs [dir ...]   (default: apps/app/dist apps/site/dist)

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/** Values that look like real credentials. */
const VALUE_PATTERNS = [
  ["Resend API key", /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}\b/],
  ["Live secret key", /\b(?:sk|rk)_live_[A-Za-z0-9]{10,}/],
  ["Private key", /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/],
  ["Cloudflare API token header", /Bearer [A-Za-z0-9_-]{40}\b/],
  ["Google OAuth client secret", /\bGOCSPX-[A-Za-z0-9_-]{20,}/],
];

/**
 * Server-only variable names. `env.NAME` access or `NAME: "<value>"` in a client bundle means server
 * code or a value leaked into it. A bare name is fine: Better Auth's client ships an env getter
 * (`get BETTER_AUTH_SECRET(){return _("BETTER_AUTH_SECRET")}`) that reads nothing in a browser.
 */
const SERVER_ONLY_NAMES = [
  "BETTER_AUTH_SECRET",
  "RESEND_API_KEY",
  "GOOGLE_CLIENT_SECRET",
  "DUITKU_API_KEY",
  "DOKU_SECRET_KEY",
  "CLOUDFLARE_API_TOKEN",
];

const TEXT = new Set([".js", ".mjs", ".html", ".css", ".json", ".map", ".txt", ".xml", ".svg", ""]);

/** Returns findings for one file's text. Pure, for tests. */
export function scanText(text) {
  const found = [];
  for (const [label, re] of VALUE_PATTERNS) if (re.test(text)) found.push(label);
  for (const name of SERVER_ONLY_NAMES) {
    const access = new RegExp(`\\.${name}\\b`);
    const literal = new RegExp(`${name}["']?\\s*[:=]\\s*["'][^"']{8,}["']`);
    if (access.test(text) || literal.test(text)) found.push(`server-only name ${name}`);
  }
  return found;
}

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (TEXT.has(extname(p))) yield p;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ["apps/app/dist", "apps/site/dist"];
  let problems = 0;
  for (const d of dirs) {
    const dir = join(root, d);
    if (!existsSync(dir)) {
      console.error(`${d} does not exist. Run pnpm build first.`);
      process.exit(2);
    }
    for (const f of files(dir)) {
      for (const what of scanText(readFileSync(f, "utf8"))) {
        console.error(`${relative(root, f)}: ${what}`);
        problems++;
      }
    }
  }
  if (problems) {
    console.error(`\n${problems} secret-looking value(s) in client bundles. Move them server-side.`);
    process.exit(1);
  }
  console.log(`No secrets in client bundles (${dirs.join(", ")}).`);
}
