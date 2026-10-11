#!/usr/bin/env node
// Picks dependency versions per Operating rule 4: the newest stable (non-prerelease)
// version published at least N days ago (default 14). Prints a table and a JSON map.
//
// Usage: node scripts/pick-versions.mjs [--days 14] <pkg>[@<major>|@~<x.y.z>] ...
//   e.g. node scripts/pick-versions.mjs hono vitest@4 expo-router@~57.0.23
// `@<major>` limits to that major; `@~x.y.z` limits to x.y.* at or above z (Expo's SDK ranges).

const args = process.argv.slice(2);
let days = 14;
const specs = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--days") days = Number(args[++i]);
  else specs.push(args[i]);
}
if (specs.length === 0) {
  console.error("Usage: node scripts/pick-versions.mjs [--days 14] <pkg>[@<major>] ...");
  process.exit(1);
}

const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
const parse = (v) => v.split(".").map(Number);
const compare = (a, b) => {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};

function splitSpec(spec) {
  const at = spec.lastIndexOf("@");
  if (at <= 0) return { name: spec, inRange: () => true };
  const name = spec.slice(0, at);
  const range = spec.slice(at + 1);
  if (range.startsWith("~")) {
    const base = range.slice(1);
    const [maj, min] = parse(base);
    return { name, inRange: (v) => parse(v)[0] === maj && parse(v)[1] === min && compare(v, base) >= 0 };
  }
  return { name, inRange: (v) => parse(v)[0] === Number(range) };
}

async function pick({ name, inRange }) {
  const res = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2F")}`);
  if (!res.ok) throw new Error(`${name}: registry returned ${res.status}`);
  const doc = await res.json();
  const latest = doc["dist-tags"]?.latest;
  const candidates = Object.keys(doc.versions)
    .filter((v) => /^\d+\.\d+\.\d+$/.test(v))
    .filter(inRange)
    // Never above the `latest` tag: some packages publish the next major early (e.g. expo-router for the next SDK).
    .filter((v) => !latest || compare(v, latest) <= 0)
    .filter((v) => Date.parse(doc.time[v]) <= cutoff)
    .filter((v) => !doc.versions[v].deprecated)
    .sort(compare);
  const version = candidates.at(-1);
  return {
    name,
    version,
    published: version ? doc.time[version].slice(0, 10) : "-",
    latest,
    latestPublished: latest ? doc.time[latest].slice(0, 10) : "-",
  };
}

const results = await Promise.all(specs.map((s) => pick(splitSpec(s))));
const pad = (s, n) => String(s).padEnd(n);
console.log(`Cutoff: published on or before ${new Date(cutoff).toISOString().slice(0, 10)} (${days} days)\n`);
console.log(`${pad("package", 40)}${pad("pick", 14)}${pad("published", 12)}latest (published)`);
for (const r of results) {
  const note = r.version === r.latest ? "" : `${r.latest} (${r.latestPublished})`;
  console.log(`${pad(r.name, 40)}${pad(r.version ?? "NONE", 14)}${pad(r.published, 12)}${note}`);
}
console.log(`\n${JSON.stringify(Object.fromEntries(results.map((r) => [r.name, r.version])), null, 2)}`);
