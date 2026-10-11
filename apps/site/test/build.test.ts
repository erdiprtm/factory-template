import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import product from "../../../product.config";

// Checks the built site (dist/), produced by `astro build` before this runs (turbo test → build).
const dist = new URL("../dist/", import.meta.url);
const page = (path: string) => readFileSync(new URL(path, dist), "utf8");
const idr = (n: number) => `Rp${n.toLocaleString("id-ID")}`;

describe("built site", () => {
  it("prices come from product.config.ts (no code edits needed)", () => {
    const html = page("harga/index.html");
    for (const plan of product.plans) {
      expect(html).toContain(plan.label);
      expect(html).toContain(idr(plan.priceIdr));
    }
  });

  it("every page has a title, description, canonical, OG image and lang", () => {
    for (const path of [
      "index.html",
      "harga/index.html",
      "privasi/index.html",
      "syarat/index.html",
      "kontak/index.html",
    ]) {
      const html = page(path);
      expect(html, path).toMatch(new RegExp(`<html lang="${product.locale.default}"`));
      expect(html, path).toMatch(/<title>[^<]{5,}<\/title>/);
      expect(html, path).toMatch(/<meta name="description" content="[^"]{50,}"/);
      expect(html, path).toMatch(/<link rel="canonical" href="https?:\/\/[^"]+\/"/);
      expect(html, path).toMatch(/<meta property="og:image" content="https?:\/\/[^"]+\.png"/);
    }
  });

  it("legal pages have no unfilled placeholders and show the TEMPLATE banner outside reviewed production", () => {
    for (const path of ["privasi/index.html", "syarat/index.html"]) {
      const html = page(path);
      expect(html).not.toContain("{{");
      expect(html).toContain(product.legal.companyName);
      expect(html).toContain("TEMPLATE — perlu review hukum sebelum launch");
    }
  });

  it("ships structured data, sitemap, robots and OG images", () => {
    expect(page("index.html")).toContain('"@type":"FAQPage"');
    expect(page("index.html")).toContain('"priceCurrency":"IDR"');
    expect(existsSync(new URL("sitemap-index.xml", dist))).toBe(true);
    expect(page("robots.txt")).toMatch(/User-agent: \*/);
    expect(readFileSync(new URL("og/home.png", dist)).subarray(1, 4).toString()).toBe("PNG");
  });

  it("CSP meta forbids inline scripts, none are needed, and _headers ships", () => {
    for (const path of ["index.html", "harga/index.html", "privasi/index.html", "404.html"]) {
      const html = page(path);
      const csp = html.match(/<meta http-equiv="content-security-policy" content="([^"]+)"/)?.[1];
      expect(csp, path).toContain("default-src 'self'");
      expect(csp, path).not.toContain("unsafe-inline");
      // No inline executable scripts at all (JSON-LD data blocks are fine): nothing to hash.
      const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>/g)];
      expect(inline, path).toEqual([]);
    }
    const headers = page("_headers");
    expect(headers).toContain("frame-ancestors 'none'");
    expect(headers).toContain("X-Content-Type-Options: nosniff");
  });

  it("non-production builds never send analytics (no OpenPanel client ID in the HTML)", () => {
    expect(page("index.html")).not.toContain("data-op-client");
  });
});
