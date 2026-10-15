import { readdirSync, readFileSync, statSync } from "node:fs";

// One domain (D-068, D-069): the app Worker owns the host and the site's paths are routed to the
// site Worker. A site file without a route 404s on the domain; a route that shadows an app path
// breaks the app. This lists every such problem; one-domain.test.ts runs it on the real files.

export type Route = { pattern: string; zone_name?: string; custom_domain?: boolean };
export type Wrangler = { routes?: Route[]; env?: Record<string, { routes?: Route[] }> };

export type OneDomainInput = {
  host: string;
  anonymousHome: string | null;
  site: Wrangler;
  api: Wrangler;
  /** Top-level entries of the built site (dist/), with whether each is a folder. */
  siteEntries: { name: string; dir: boolean }[];
  /** Top-level URL segments of the app: screens, plus api, _expo and assets. */
  appSegments: string[];
  /**
   * Top-level entries the app serves too (apps/app/public), with whether the site's copy is the
   * same files. Same files may stay unrouted (the app serves them); different ones need a route.
   */
  sharedWithApp: Map<string, boolean>;
};

/** Every problem with the one-domain routing, as readable sentences; [] = fine. */
export function oneDomainProblems(i: OneDomainInput): string[] {
  const problems: string[] = [];
  const routes = i.site.routes ?? [];
  const paths = routes.map((r) => r.pattern.slice(i.host.length));
  const routed = (path: string) => paths.some((p) => (p.endsWith("*") ? path.startsWith(p.slice(0, -1)) : path === p));

  // The app's Custom Domain lives in the dashboard: a route in its config would make `wrangler
  // dev` rewrite local requests to the production host.
  if (i.api.routes !== undefined)
    problems.push("apps/api/wrangler.jsonc must not have routes (Custom Domain in the dashboard)");
  if (JSON.stringify(i.site.env?.preview?.routes) !== "[]")
    problems.push('apps/site/wrangler.jsonc env.preview needs "routes": [] (previews never take the domain)');
  for (const r of routes) {
    if (!r.pattern.startsWith(`${i.host}/`)) problems.push(`route ${r.pattern} is not on ${i.host}`);
    if (!r.zone_name || !(i.host === r.zone_name || i.host.endsWith(`.${r.zone_name}`)))
      problems.push(`route ${r.pattern} needs the zone_name of ${i.host}`);
  }

  // "/" is the app's; index.html, 404.html and _headers are served by the site Worker itself.
  for (const { name, dir } of i.siteEntries) {
    if (["index.html", "404.html", "_headers"].includes(name)) continue;
    const path = dir ? `/${name}/` : `/${name}`;
    if (routed(path)) continue;
    if (i.sharedWithApp.get(name) === true) continue;
    problems.push(
      i.sharedWithApp.has(name)
        ? `${path} is in both Workers with different files: route it to the site or make the files the same`
        : `${path} has no route: add { "pattern": "${i.host}/${name}${dir ? "*" : ""}" }`,
    );
  }
  if (i.anonymousHome && !routed(i.anonymousHome))
    problems.push(`domain.anonymousHome ${i.anonymousHome} has no route to the site`);

  for (const s of i.appSegments) {
    if (routed(`/${s}`) || routed(`/${s}/`)) problems.push(`a route shadows the app's /${s}`);
  }
  if (routed("/")) problems.push('a route shadows the app\'s "/"');
  return problems;
}

/**
 * The installable app's files (D-080), always the app's even before `pnpm theme` writes them (or
 * when pwa.enabled is false): a site route must never take the manifest, the icons, or /sw.js (kept
 * for a service worker; there is none today).
 */
export const PWA_APP_PATHS = ["manifest.webmanifest", "icons", "apple-touch-icon.png", "sw.js"];

/** The app's top-level public entries (served at the root) that the site doesn't share, plus PWA_APP_PATHS. */
export function appPublicSegments(appPublic: URL, sharedWithApp: Map<string, boolean>): string[] {
  const own = readdirSync(appPublic).filter((name) => !name.startsWith("_") && !sharedWithApp.has(name));
  return [...new Set([...own, ...PWA_APP_PATHS])];
}

/** Top-level URL segments of an Expo Router app dir: groups like (app) and layouts add none. */
export function appSegmentsOf(dir: URL): string[] {
  const out = new Set<string>();
  for (const name of readdirSync(dir)) {
    if (name.startsWith("(") && statSync(new URL(`${name}/`, dir)).isDirectory()) {
      for (const s of appSegmentsOf(new URL(`${name}/`, dir))) out.add(s);
      continue;
    }
    const segment = name.replace(/\.(tsx|ts)$/, "");
    if (segment === "_layout" || segment === "index" || segment.startsWith("+")) continue;
    out.add(segment);
  }
  return [...out];
}

/** Every file under a folder, as paths relative to it. */
function filesIn(dir: URL, prefix = ""): string[] {
  return readdirSync(dir).flatMap((name) =>
    statSync(new URL(name, dir)).isDirectory()
      ? filesIn(new URL(`${name}/`, dir), `${prefix}${name}/`)
      : [`${prefix}${name}`],
  );
}

/** Whether a site entry and the app's entry of the same name (file or folder URL) hold the same bytes. */
export function sameFiles(siteEntry: URL, appEntry: URL): boolean {
  if (!statSync(siteEntry).isDirectory()) return readFileSync(siteEntry).equals(readFileSync(appEntry));
  const list = filesIn(siteEntry).sort();
  if (list.join("\n") !== filesIn(appEntry).sort().join("\n")) return false;
  return list.every((f) => readFileSync(new URL(f, siteEntry)).equals(readFileSync(new URL(f, appEntry))));
}

/** Our wrangler.jsonc files only have full-line comments. */
export function readJsonc(url: URL): Wrangler {
  return JSON.parse(
    readFileSync(url, "utf8")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n"),
  );
}
