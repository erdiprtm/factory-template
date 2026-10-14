// Where the site and the app live, for canonical URLs, the sitemap, OG images and "Masuk" links
// (D-069, D-073). No hostnames here: they come from env (CI), product.config.ts `domain`, or this
// product's entry in factory.json (its workers.dev URLs, written by /new-product). Template-owned
// files therefore keep nothing that a sync could bring back as another product's URL.

/** @typedef {{ products: { slug: string, urls?: { app?: string, site?: string } }[] }} Registry */
/** @typedef {{ app: string | null, site: string | null }} Domain */

/** @param {Registry} registry @param {string} slug */
const entry = (registry, slug) => registry.products.find((p) => p.slug === slug)?.urls ?? {};

/**
 * The site's own URL.
 * Production with a domain → the domain; else SITE_URL (CI) → the domain → factory.json → local dev.
 * @param {{ production: boolean, env?: string, domain: Domain, slug: string, registry: Registry }} o
 */
export function siteUrl({ production, env, domain, slug, registry }) {
  if (production && domain.site) return `https://${domain.site}`;
  return (
    env || (domain.site ? `https://${domain.site}` : null) || entry(registry, slug).site || "http://localhost:4321"
  );
}

/**
 * The app's URL, the same way: production with a domain → the domain; else PUBLIC_APP_URL (CI) →
 * the domain → factory.json → local `wrangler dev` (pnpm dev's :8787).
 * @param {{ production: boolean, env?: string, domain: Domain, slug: string, registry: Registry }} o
 */
export function appUrlFor({ production, env, domain, slug, registry }) {
  if (production && domain.app) return `https://${domain.app}`;
  return env || (domain.app ? `https://${domain.app}` : null) || entry(registry, slug).app || "http://localhost:8787";
}
