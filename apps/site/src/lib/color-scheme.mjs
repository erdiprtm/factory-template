// What Base.astro puts in <head> for light/dark (D-076).
// darkMode true (default): /theme.js adds .dark before paint when the device is dark; no
// color-scheme meta (today's behaviour). darkMode false: a light-only product, so no /theme.js and
// <meta name="color-scheme" content="light"> keeps form controls and scrollbars light.

/**
 * @param {boolean} darkMode product.brand.darkMode
 * @returns {{ themeScript: boolean, colorScheme: "light" | null }}
 */
export function colorSchemeHead(darkMode) {
  return darkMode ? { themeScript: true, colorScheme: null } : { themeScript: false, colorScheme: "light" };
}
