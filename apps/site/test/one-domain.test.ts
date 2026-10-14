import { existsSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import product from "../../../product.config";
import { appSegmentsOf, type OneDomainInput, oneDomainProblems, readJsonc, sameFiles } from "./one-domain";

// One domain (D-068, D-069): app and site on the same host. Runs on this product's real files when
// domain.site equals domain.app (after `astro build`, dist/); the checker itself is tested always.
const { app: host, site: siteHost, anonymousHome } = product.domain;
const oneDomain = host !== null && siteHost === host;

describe("one domain: this product's routing", () => {
  it.skipIf(!oneDomain)("every site path is routed, none shadows the app, previews take no route", () => {
    const dist = new URL("../dist/", import.meta.url);
    const appPublic = new URL("../../app/public/", import.meta.url);
    const siteEntries = readdirSync(dist).map((name) => ({ name, dir: statSync(new URL(name, dist)).isDirectory() }));
    const sharedWithApp = new Map<string, boolean>();
    for (const { name, dir } of siteEntries) {
      const appEntry = new URL(dir ? `${name}/` : name, appPublic);
      if (existsSync(appEntry)) sharedWithApp.set(name, sameFiles(new URL(dir ? `${name}/` : name, dist), appEntry));
    }
    const problems = oneDomainProblems({
      host: host as string,
      anonymousHome,
      site: readJsonc(new URL("../wrangler.jsonc", import.meta.url)),
      api: readJsonc(new URL("../../api/wrangler.jsonc", import.meta.url)),
      siteEntries,
      // The app's screens, its API and build folders, and its public files (served at the root).
      appSegments: [
        ...appSegmentsOf(new URL("../../app/src/app/", import.meta.url)),
        ...readdirSync(appPublic).filter((name) => !name.startsWith("_") && !sharedWithApp.has(name)),
        "api",
        "_expo",
        "assets",
      ],
      sharedWithApp,
    });
    expect(problems).toEqual([]);
  });
});

describe("one-domain checker", () => {
  const host = "fit.example.id";
  const r = (path: string) => ({ pattern: `${host}${path}`, zone_name: "example.id" });
  const good: OneDomainInput = {
    host,
    anonymousHome: "/mulai/",
    site: { routes: [r("/harga*"), r("/mulai/*"), r("/_astro/*"), r("/robots.txt")], env: { preview: { routes: [] } } },
    api: {},
    siteEntries: [
      { name: "index.html", dir: false },
      { name: "404.html", dir: false },
      { name: "_headers", dir: false },
      { name: "harga", dir: true },
      { name: "mulai", dir: true },
      { name: "_astro", dir: true },
      { name: "robots.txt", dir: false },
      { name: "exercises", dir: true },
    ],
    appSegments: ["sign-in", "quiz", "account", "api", "_expo", "assets"],
    sharedWithApp: new Map([
      ["exercises", true],
      ["robots.txt", false],
    ]),
  };

  it("accepts a complete setup (shared same-file folders need no route; differing ones are routed)", () => {
    expect(oneDomainProblems(good)).toEqual([]);
  });

  it("names a site path without a route, and a shared folder whose files differ", () => {
    const problems = oneDomainProblems({
      ...good,
      siteEntries: [...good.siteEntries, { name: "artikel", dir: true }],
      sharedWithApp: new Map([["exercises", false]]),
    });
    expect(problems).toContain('/artikel/ has no route: add { "pattern": "fit.example.id/artikel*" }');
    expect(problems.some((p) => p.startsWith("/exercises/ is in both Workers"))).toBe(true);
  });

  it("names a route that shadows an app screen or /, and an unrouted anonymousHome", () => {
    const site = { ...good.site, routes: [r("/harga*"), r("/quiz*"), r("/"), r("/_astro/*"), r("/robots.txt")] };
    const problems = oneDomainProblems({
      ...good,
      site,
      siteEntries: good.siteEntries.filter((e) => e.name !== "mulai"),
    });
    expect(problems).toContain("a route shadows the app's /quiz");
    expect(problems).toContain('a route shadows the app\'s "/"');
    expect(problems).toContain("domain.anonymousHome /mulai/ has no route to the site");
  });

  it("names routes on the app Worker, routes inherited by previews, and wrong hosts or zones", () => {
    const problems = oneDomainProblems({
      ...good,
      api: { routes: [r("/*")] },
      site: {
        routes: [...(good.site.routes ?? []), { pattern: "other.id/x", zone_name: "other.id" }],
        env: { preview: {} },
      },
    });
    expect(problems).toContain("apps/api/wrangler.jsonc must not have routes (Custom Domain in the dashboard)");
    expect(problems.some((p) => p.includes("env.preview"))).toBe(true);
    expect(problems).toContain("route other.id/x is not on fit.example.id");
    expect(problems).toContain("route other.id/x needs the zone_name of fit.example.id");
  });

  it("reads this repo's app screens", () => {
    const segments = appSegmentsOf(new URL("../../app/src/app/", import.meta.url));
    expect(segments).toContain("sign-in");
    expect(segments).toContain("quiz");
    expect(segments).not.toContain("_layout");
  });
});
