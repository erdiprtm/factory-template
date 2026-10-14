import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import product from "../../../product.config";
import { appUrlFor, siteUrl } from "../src/lib/urls.mjs";

// D-073: local builds without SITE_URL / PUBLIC_APP_URL use this product's own URLs, never the
// template's, and template-owned files carry no hostnames that a sync could bring back.
const registry = {
  products: [
    {
      slug: "myna-fit",
      urls: { app: "https://myna-fit.acme.workers.dev", site: "https://myna-fit-site.acme.workers.dev" },
    },
  ],
};
const none = { app: null, site: null };
const one = { app: "fit.example.id", site: "fit.example.id" };

describe("site and app URLs", () => {
  it("local build without env: this product's workers.dev URLs from factory.json", () => {
    const o = { production: false, domain: none, slug: "myna-fit", registry };
    expect(siteUrl(o)).toBe("https://myna-fit-site.acme.workers.dev");
    expect(appUrlFor(o)).toBe("https://myna-fit.acme.workers.dev");
  });

  it("CI's env wins outside production; production with a domain uses the domain", () => {
    const ci = { production: false, env: "https://pr-3.x.workers.dev", domain: one, slug: "myna-fit", registry };
    expect(siteUrl(ci)).toBe("https://pr-3.x.workers.dev");
    expect(appUrlFor({ ...ci, production: true })).toBe("https://fit.example.id");
    expect(siteUrl({ ...ci, production: true })).toBe("https://fit.example.id");
    expect(siteUrl({ ...ci, env: undefined })).toBe("https://fit.example.id");
  });

  it("a repo that isn't in factory.json (the template itself) falls back to local dev, not someone's host", () => {
    const o = { production: false, domain: none, slug: "factory-template", registry };
    expect(siteUrl(o)).toBe("http://localhost:4321");
    expect(appUrlFor(o)).toBe("http://localhost:8787");
  });

  it("this repo resolves to its own slug or a local URL, and the site's code names no workers.dev host", () => {
    const real = JSON.parse(readFileSync(new URL("../../../factory.json", import.meta.url), "utf8"));
    const url = siteUrl({ production: false, domain: product.domain, slug: product.slug, registry: real });
    expect(
      url.includes(product.slug) || url.startsWith("http://localhost") || url.includes(product.domain.site ?? "-"),
    ).toBe(true);
    for (const file of ["../astro.config.mjs", "../src/lib/site.ts", "../src/lib/urls.mjs"]) {
      expect(readFileSync(new URL(file, import.meta.url), "utf8"), file).not.toMatch(
        /[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/,
      );
    }
  });
});
