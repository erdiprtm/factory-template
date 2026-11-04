import product from "../../../../product.config";

/**
 * Native: the API runs elsewhere. EXPO_PUBLIC_API_URL wins (dev: wrangler dev on the laptop's LAN
 * address); otherwise the product's own domain (`domain.app`, D-119), so a store build needs no
 * per-build setting.
 */
export function apiBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL || (product.domain.app ? `https://${product.domain.app}` : "");
  if (!url) throw new Error("Set domain.app in product.config.ts (or EXPO_PUBLIC_API_URL) for native builds");
  return url;
}

/** Native: no browser cookies; the session goes in a header (auth/client.ts sessionHeaders, D-120). */
export const fetchCredentials: RequestCredentials = "omit";

/** Where an auth flow returns to (native: the path; deep links come with native sign-in, Phase 10). */
export function appReturnUrl(path: string): string {
  return path;
}
