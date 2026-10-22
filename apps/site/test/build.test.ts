import { existsSync, readdirSync, readFileSync } from "node:fs";
import { methodChips } from "@factory/core/pricing";
import { describe, expect, it } from "vitest";
import product from "../../../product.config";

// Checks the built site (dist/), produced by `astro build` before this runs (turbo test → build).
const dist = new URL("../dist/", import.meta.url);
const page = (path: string) => readFileSync(new URL(path, dist), "utf8");
const idr = (n: number) => `Rp${n.toLocaleString("id-ID")}`;

describe("built site", () => {
  it("dark mode follows brand.darkMode: /theme.js with it, color-scheme light without (D-076)", () => {
    const html = page("index.html");
    expect(html.includes('src="/theme.js"')).toBe(product.brand.darkMode);
    expect(html.includes('<meta name="color-scheme" content="light"')).toBe(!product.brand.darkMode);
  });

  it("links PNG and ICO favicons before the SVG one, and serves them at their sizes (D-096)", () => {
    const html = page("index.html");
    const at = (s: string) => html.indexOf(s);
    expect(at('<link rel="icon" href="/favicon.ico" sizes="16x16 32x32"')).toBeGreaterThan(-1);
    expect(at('sizes="32x32" href="/favicon-32.png"')).toBeGreaterThan(-1);
    expect(at('sizes="16x16" href="/favicon-16.png"')).toBeGreaterThan(-1);
    expect(at('sizes="16x16" href="/favicon-16.png"')).toBeLessThan(at(`href="${product.brand.favicon}"`));
    for (const [file, size] of [
      ["favicon-16.png", 16],
      ["favicon-32.png", 32],
    ] as const) {
      const png = readFileSync(new URL(file, dist));
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], file).toEqual([size, size]);
    }
    expect(readFileSync(new URL("favicon.ico", dist)).readUInt16LE(4)).toBe(2);
  });

  it("the header shows the name, the logo or both, per brand.header (D-096)", () => {
    const header = page("index.html").match(/<header[\s\S]*?<\/header>/)?.[0] ?? "";
    const link = header.match(/<a href="[^"]*" class="inline-flex min-h-11[^>]*>[\s\S]*?<\/a>/)?.[0] ?? "";
    const { show, logoHeight } = product.brand.header;
    expect(link.includes("<img")).toBe(show !== "name");
    expect(link.replace(/<[^>]+>/g, "").includes(product.name)).toBe(show !== "logo");
    if (show !== "name") {
      expect(link).toContain(`src="${product.brand.logo}"`);
      expect(link).toContain(`height="${logoHeight}"`);
      // Astro writes an empty alt as a bare `alt` (decorative: the name follows as text).
      if (show === "logo") expect(link).toContain(`alt="${product.name}"`);
      else expect(link).toMatch(/<img[^>]*\salt(="")?[\s>]/);
    }
  });

  it("the plans' terms show once under the cards, not on every card (D-099)", () => {
    const html = page("harga/index.html");
    expect(html.match(/tanpa perpanjangan otomatis<\/p>/g) ?? []).toHaveLength(1);
    expect(html).toContain('data-testid="plan-terms">Bayar sekali · tanpa perpanjangan otomatis</p>');
  });

  it("payment methods are compact chips from config, and the FAQ lists the same ones (D-098)", () => {
    const html = page("harga/index.html");
    const chips = methodChips(product.payments.methods);
    const block = html.match(/data-testid="pay-methods"[\s\S]*?<\/div>/)?.[0] ?? "";
    for (const chip of chips) expect(block).toContain(`>${chip}</span>`);
    expect(html).toContain(`${chips.join(", ")}.`);
    expect(html).not.toContain("e-wallet (seperti DANA");
  });

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

  it("landing: the closing CTA repeats the hero's label; the header's sign-in isn't a second filled button (D-077)", () => {
    const html = page("index.html");
    const label = (where: string) => html.match(new RegExp(`<a[^>]*data-cta="${where}"[^>]*>([^<]+)</a>`))?.[1]?.trim();
    // Products that restructure their landing without these markers skip the label check.
    if (label("hero") !== undefined) expect(label("close")).toBe(label("hero"));
    const header = html.match(/<header[\s\S]*?<\/header>/)?.[0] ?? "";
    expect(header).not.toMatch(/bg-primary/);
    expect(header).toMatch(/min-h-11/);
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

  it("ad landers: hook as the headline, one way forward to the quiz, noindex, not in the sitemap", () => {
    // Whichever lander the product ships first (products replace the template's example, D-035).
    const dir = new URL("../src/content/landers/", import.meta.url);
    const file = readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .sort()[0] as string;
    const hook = readFileSync(new URL(file, dir), "utf8").match(/^hook: "(.*)"$/m)?.[1] ?? "";
    const html = page(`l/${file.replace(/\.md$/, "")}/index.html`);
    expect(html).toContain(
      `<h1 class="text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">${hook.replaceAll("&", "&amp;")}</h1>`,
    );
    expect(html).toContain('<meta name="robots" content="noindex"');
    expect(html).toContain('data-page-event="lp_view"');
    expect(html).toMatch(/href="[^"]+\/quiz" data-event="cta_tap"/);
    expect(html).not.toContain(`href="/harga/"`); // no nav: the CTA is the only way forward
    expect(html).toContain("/minggu");
    expect(page("sitemap-0.xml")).not.toContain("/l/");
  });
});
