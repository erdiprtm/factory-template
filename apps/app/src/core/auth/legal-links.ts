import registry from "../../../../../factory.json";
import product from "../../../../../product.config";

// Where the site's legal pages live, for the consent row's links (D-074): the own domain once set,
// else this product's site URL in factory.json (D-073), else the local site. Opens in the browser.
const base =
  (product.domain.site ? `https://${product.domain.site}` : null) ??
  registry.products.find((p) => p.slug === product.slug)?.urls?.site ??
  "http://localhost:4321";

export const legalUrls = { terms: `${base}/syarat/`, privacy: `${base}/privasi/` } as const;
