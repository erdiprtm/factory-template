#!/usr/bin/env node
// Creates a new product repo from this template (Phase 8). Default is a DRY RUN that prints
// the plan; pass --execute to do it. Used by the /new-product playbook.
//
// Usage:
//   node scripts/new-product.mjs --spec specs/<slug>.md --slug <slug> --owner <github-owner> \
//     --subdomain <workers-subdomain> [--public] [--dir ../<slug>] [--execute]
//
// Steps (--execute):
//   1. spec-check   2. gh repo create --template   3. product.config.ts + wrangler names/hosts
//   4. wrangler d1 create <slug>-prod / <slug>-preview, IDs written to wrangler.jsonc
//   5. theme + commit + push   6. scripts/setup-github.sh on the new repo + CI secrets
//      (account id, random BETTER_AUTH_SECRET per environment)   7. factory.json entry here
// The push to main skips the deploy (not configured yet); the first PR merge deploys.
// Human afterwards: `gh secret set CLOUDFLARE_API_TOKEN --repo <owner>/<slug>` (token is never copied).

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkSpec, sections } from "./spec-check.mjs";

const TEMPLATE_SLUG = "factory-template";

/** Extracts what product.config.ts needs from a spec. */
export function parseSpec(markdown) {
  const title = markdown.match(/^#\s+(.+?)\s+—\s+Spec v\d+/m)?.[1]?.trim();
  const secs = sections(markdown);
  const oneLiner = (secs["One-liner"] ?? "").trim().split("\n")[0]?.trim() ?? "";
  const plansText = Object.entries(secs).find(([k]) => k.toLowerCase().startsWith("plans"))?.[1] ?? "";
  const plans = [...plansText.matchAll(/(\d+)\s*bulan:\s*Rp\s*([\d.]+)/gi)].map((m) => ({
    months: Number(m[1]),
    priceIdr: Number(m[2].replaceAll(".", "")),
  }));
  return { name: title ?? "", tagline: oneLiner, plans };
}

/** Rewrites identity fields in product.config.ts. Keeps everything else (tokens, legal…) as-is. */
export function applyProductConfig(text, { slug, name, tagline, plans }) {
  let out = text
    .replace(/slug: "[^"]*"/, `slug: "${slug}"`)
    .replace(
      /name: "[^"]*",\n(\s*)tagline: "[^"]*"/,
      `name: ${JSON.stringify(name)},\n$1tagline: ${JSON.stringify(tagline)}`,
    );
  // Each product gets its own OpenPanel project: never send its events into the template's.
  out = out.replace(/openpanelClientId: "[^"]*"/, "openpanelClientId: null");
  out = out.replace(/sentryDsn: "[^"]*"/, "sentryDsn: null");
  if (plans.length > 0) {
    const lines = plans
      .map((p, i) => {
        const id = `${p.months}m`;
        const highlight = i === plans.length - 1 && plans.length > 1 ? ", highlight: true" : "";
        return `    { id: "${id}", label: "${p.months} bulan", months: ${p.months}, priceIdr: ${p.priceIdr}${highlight} },`;
      })
      .join("\n");
    out = out.replace(/plans: \[\n[\s\S]*?\n {2}\],/, `plans: [\n${lines}\n  ],`);
  }
  return out;
}

/** Renames Workers/hosts from the template slug and account subdomain to the new product's. */
export function renameWorkers(text, { slug, subdomain, templateSubdomain = "erdiprtm" }) {
  return text
    .replaceAll(`${TEMPLATE_SLUG}.${templateSubdomain}.workers.dev`, `${slug}.${subdomain}.workers.dev`)
    .replaceAll(`${TEMPLATE_SLUG}-preview.${templateSubdomain}.workers.dev`, `${slug}-preview.${subdomain}.workers.dev`)
    .replaceAll(`${TEMPLATE_SLUG}-site`, `${slug}-site`)
    .replaceAll(`"name": "${TEMPLATE_SLUG}"`, `"name": "${slug}"`)
    .replaceAll(`${TEMPLATE_SLUG}-prod`, `${slug}-prod`)
    .replaceAll(`${TEMPLATE_SLUG}-preview`, `${slug}-preview`);
}

/** Puts freshly created D1 database ids into apps/api/wrangler.jsonc (prod first, then preview). */
export function setD1Ids(text, { prodId, previewId }) {
  let n = 0;
  return text.replace(/"database_id": "[0-9a-f-]{36}"/g, (m) => {
    n++;
    if (n === 1) return `"database_id": "${prodId}"`;
    if (n === 2) return `"database_id": "${previewId}"`;
    return m;
  });
}

/** Adds or updates the product in the portfolio registry (factory.json). */
export function registerProduct(json, entry) {
  const data = JSON.parse(json);
  data.products = (data.products ?? []).filter((p) => p.slug !== entry.slug && p.slug !== "example");
  data.products.push(entry);
  return `${JSON.stringify(data, null, 2)}\n`;
}

function parseArgs(argv) {
  const a = { public: false, execute: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--public") a.public = true;
    else if (k === "--execute") a.execute = true;
    else if (k.startsWith("--")) a[k.slice(2)] = argv[++i];
  }
  for (const req of ["spec", "slug", "owner", "subdomain"]) if (!a[req]) throw new Error(`--${req} is required`);
  if (!/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(a.slug))
    throw new Error("--slug must be lowercase letters, digits, dashes");
  a.dir = resolve(a.dir ?? join("..", a.slug));
  return a;
}

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8", ...opts });

function main() {
  const a = parseArgs(process.argv.slice(2));
  const specText = readFileSync(a.spec, "utf8");
  const problems = checkSpec(specText);
  if (problems.length) throw new Error(`Spec not ready:\n- ${problems.join("\n- ")}`);
  const spec = parseSpec(specText);
  const repo = `${a.owner}/${a.slug}`;
  const templateRepo = run("gh", ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]).trim();
  const appUrl = `https://${a.slug}.${a.subdomain}.workers.dev`;
  const siteUrl = `https://${a.slug}-site.${a.subdomain}.workers.dev`;

  const plan = [
    `Spec OK: "${spec.name}" — ${spec.tagline}`,
    `Plans: ${spec.plans.map((p) => `${p.months} bulan Rp${p.priceIdr}`).join(", ") || "(template defaults)"}`,
    `gh repo create ${repo} --template ${templateRepo} --${a.public ? "public" : "private"} --clone → ${a.dir}`,
    `product.config.ts, wrangler.jsonc (api + site): slug/name/hosts → ${a.slug} on ${a.subdomain}.workers.dev`,
    `wrangler d1 create ${a.slug}-prod and ${a.slug}-preview (region apac), ids → apps/api/wrangler.jsonc`,
    `pnpm theme, wrangler types, commit "chore: create ${a.slug} from factory template", push`,
    `scripts/setup-github.sh ${repo} ${appUrl} ${siteUrl}; gh secret set CLOUDFLARE_ACCOUNT_ID, BETTER_AUTH_SECRET_PRODUCTION / _PREVIEW (random)`,
    `factory.json here: ${a.slug} status "building"`,
    `HUMAN: gh secret set CLOUDFLARE_API_TOKEN --repo ${repo}`,
  ];
  console.log(`${a.execute ? "Creating" : "DRY RUN (add --execute)"}:\n- ${plan.join("\n- ")}`);
  if (!a.execute) return;
  if (existsSync(a.dir)) throw new Error(`${a.dir} already exists`);

  run("gh", ["repo", "create", repo, "--template", templateRepo, a.public ? "--public" : "--private", "--clone"], {
    cwd: resolve(a.dir, ".."),
  });
  const inRepo = (p) => join(a.dir, p);
  const edit = (p, fn) => writeFileSync(inRepo(p), fn(readFileSync(inRepo(p), "utf8")));

  edit("product.config.ts", (t) => applyProductConfig(t, { slug: a.slug, ...spec }));
  for (const p of [
    "apps/api/wrangler.jsonc",
    "apps/site/wrangler.jsonc",
    "apps/site/astro.config.mjs",
    "apps/site/src/lib/site.ts",
  ]) {
    edit(p, (t) => renameWorkers(t, { slug: a.slug, subdomain: a.subdomain }));
  }
  writeFileSync(inRepo(`specs/${a.slug}.md`), specText);

  const d1 = (name) => {
    const out = run("pnpm", ["exec", "wrangler", "d1", "create", name, "--location", "apac"], {
      cwd: inRepo("apps/api"),
    });
    const id = out.match(/"database_id":\s*"([0-9a-f-]{36})"/)?.[1];
    if (!id) throw new Error(`Could not read the database id for ${name}`);
    return id;
  };
  run("pnpm", ["install"], { cwd: a.dir, stdio: "inherit" });
  edit("apps/api/wrangler.jsonc", (t) =>
    setD1Ids(t, { prodId: d1(`${a.slug}-prod`), previewId: d1(`${a.slug}-preview`) }),
  );
  run("pnpm", ["theme"], { cwd: a.dir });
  // Worker types embed the Worker/env names, so regenerate them after the rename (else typecheck fails).
  run("pnpm", ["--filter", "@factory/api", "types"], { cwd: a.dir });
  run("git", ["add", "-A"], { cwd: a.dir });
  run("git", ["commit", "-m", `chore: create ${a.slug} from factory template`], { cwd: a.dir });
  run("git", ["push", "-u", "origin", "HEAD"], { cwd: a.dir });

  run("bash", ["scripts/setup-github.sh", repo, appUrl, siteUrl], { cwd: a.dir, stdio: "inherit" });
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (accountId) run("gh", ["secret", "set", "CLOUDFLARE_ACCOUNT_ID", "--repo", repo, "--body", accountId]);
  // Per-environment session keys. CI uploads them with each deploy (--secrets-file), so the very
  // first preview and production smoke tests pass. Passed on stdin: never in argv or logs (D-027).
  for (const name of ["BETTER_AUTH_SECRET_PRODUCTION", "BETTER_AUTH_SECRET_PREVIEW"]) {
    run("gh", ["secret", "set", name, "--repo", repo], {
      input: randomBytes(48).toString("base64"),
      stdio: ["pipe", "pipe", "inherit"],
    });
  }

  const registry = fileURLToPath(new URL("../factory.json", import.meta.url));
  writeFileSync(
    registry,
    registerProduct(readFileSync(registry, "utf8"), {
      slug: a.slug,
      name: spec.name,
      repo,
      status: "building",
      spec: `specs/${a.slug}.md`,
      launchDate: null,
      reviewDate: null,
      metricTargets: {},
      killCriteria: specText.match(/Kill criteria[^:]*:\s*(.*)/i)?.[1]?.trim() ?? null,
      urls: { app: appUrl, site: siteUrl },
    }),
  );
  console.log(
    `\nCreated ${repo} in ${a.dir}.\nHUMAN: gh secret set CLOUDFLARE_API_TOKEN --repo ${repo}${accountId ? "" : `\nAlso: gh secret set CLOUDFLARE_ACCOUNT_ID --repo ${repo}`}`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
