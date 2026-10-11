// @ts-check
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// SITE_URL is set by CI per environment (production / preview). Canonical URLs, the sitemap and
// OG image URLs are built from it. product.config.ts `domain.site` replaces it once a domain exists.
const site = process.env.SITE_URL ?? "https://factory-template-site.erdiprtm.workers.dev";

export default defineConfig({
  site,
  output: "static",
  trailingSlash: "always",
  build: { format: "directory" },
  compressHTML: true,
  integrations: [sitemap({ filter: (page) => !page.includes("/og/") })],
  vite: { plugins: [tailwindcss()] },
});
