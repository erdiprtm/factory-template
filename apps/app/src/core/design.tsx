import type { UiTokens } from "@factory/ui";
import { useFonts } from "expo-font";
import product from "../../../../product.config";
import { bundledFonts } from "./fonts.generated";

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

/**
 * True once the product's bundled fonts are loaded (expo-font: web and native, no Google calls).
 * Without bundled fonts it's true at once, so nothing waits and nothing flashes.
 */
export const useAppFonts: () => boolean =
  Object.keys(bundledFonts).length > 0 ? () => useFonts(bundledFonts)[0] : () => true;
