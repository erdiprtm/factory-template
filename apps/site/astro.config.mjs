// @ts-check

import { readFileSync } from "node:fs";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import product from "../../product.config";
import { siteUrl } from "./src/lib/urls.mjs";

// Canonical URLs, the sitemap and OG image URLs are built from `site`: the own domain on production
// builds once `domain.site` is set (D-069), else SITE_URL from CI (workers.dev, so the smoke test
// still reaches the site's own "/"; previews), else this product's URL in factory.json (D-073).
const production = process.env.PUBLIC_APP_ENV === "production";
const registry = JSON.parse(readFileSync(new URL("../../factory.json", import.meta.url), "utf8"));
const site = siteUrl({ production, env: process.env.SITE_URL, domain: product.domain, slug: product.slug, registry });
// One domain (D-068): "/" belongs to the app there, so the site's own home stays out of the sitemap;
// its copy at domain.anonymousHome is the landing search engines see.
const oneDomain = production && product.domain.app !== null && product.domain.site === product.domain.app;
/** @param {string} page */
const isHome = (page) => new URL(page).pathname === "/";

export default defineConfig({
  site,
  output: "static",
  trailingSlash: "always",
  build: { format: "directory" },
  compressHTML: true,
  // Hash-based CSP <meta> on every page (inline scripts allowed by hash only). Headers that a
  // <meta> can't carry (frame-ancestors…) live in public/_headers.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data: https:",
        "connect-src 'self' https:",
        "font-src 'self'",
        "form-action 'self'",
      ],
      // The Meta Pixel (D-034): loaded only with marketing consent, on products with a Pixel ID.
      scriptDirective: { resources: ["'self'", "https://connect.facebook.net"] },
    },
  },
  // Ad landers (/l/…) are noindex: only reachable from ads, so they stay out of the sitemap too.
  integrations: [
    sitemap({
      filter: (page) => !page.includes("/og/") && !page.includes("/l/") && !(oneDomain && isHome(page)),
    }),
  ],
  // Never inline scripts into HTML: the CSP allows script files from self only.
  vite: { plugins: [tailwindcss()], build: { assetsInlineLimit: 0 } },
});
