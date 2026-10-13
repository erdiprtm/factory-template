import type { UiTokens } from "@factory/ui";
import { useEffect, useState } from "react";
import product from "../../../../product.config";
import { useBundledFonts } from "./font-loading";
import { hydrateKv, kvReady } from "./kv";

// The product's design tokens for @factory/ui, from product.config.ts brand.tokens (D-052).
// Colors, radii and control height are CSS variables (scripts/gen-theme.mjs); these are the rest.
const brand = product.brand.tokens;
const weightsOf = (family: string | undefined) => brand.fonts.filter((f) => f.family === family).map((f) => f.weight);
export const uiTokens: UiTokens = {
  shadow: brand.shadow,
  density: brand.density,
  weights: brand.weights,
  // The bundled weights per role (D-057): @factory/ui picks the nearest file for each text.
  fonts:
    brand.fonts.length > 0
      ? {
          sans: weightsOf(brand.fontFamily.sans),
          heading: weightsOf(brand.fontFamily.heading ?? brand.fontFamily.sans),
        }
      : false,
};

/** True once stored values (core/kv) are loaded: instantly on web, after AsyncStorage on native (D-060). */
function useStorageReady(): boolean {
  const [ready, setReady] = useState(kvReady);
  useEffect(() => {
    if (!ready) void hydrateKv().then(() => setReady(true));
  }, [ready]);
  return ready;
}

/**
 * The root layout renders once fonts and stored values are ready: on native after both load, on
 * web at once (fonts swap in, D-065; storage is localStorage).
 */
export function useAppFonts(): boolean {
  const fonts = useBundledFonts();
  const storage = useStorageReady();
  return fonts && storage;
}
