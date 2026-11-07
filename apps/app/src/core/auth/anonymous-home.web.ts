import product from "../../../../../product.config";
import { anonymousHomeFor } from "./anonymous-home-rule";

/** The landing page for a signed-out visitor at `path` on this host (D-068); null = sign-in. */
export function anonymousHome(path: string): string | null {
  return anonymousHomeFor(path, window.location.hostname, product.domain);
}

/** The product's landing page, to leave sign-in for (D-124): the one-domain landing, else the site. */
export function siteLanding(): string | null {
  return product.domain.anonymousHome ?? (product.domain.site ? `https://${product.domain.site}/` : null);
}

/**
 * Leaves the app for a site page with a full page load: on one domain the landing is the site
 * Worker's path, which the app's router can't render. `keepQuery` carries ?utm_… along.
 */
export function leaveTo(url: string, keepQuery = false): void {
  window.location.replace(keepQuery ? `${url}${window.location.search}` : url);
}
