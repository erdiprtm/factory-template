import type { UiTokens } from "@factory/ui";
import { useFonts } from "expo-font";
import product from "../../../../product.config";
import { bundledFonts } from "./fonts.generated";

// The product's design tokens for @factory/ui, from product.config.ts brand.tokens (D-052).
// Colors, radii and control height are CSS variables (scripts/gen-theme.mjs); these are the rest.
const brand = product.brand.tokens;
export const uiTokens: UiTokens = {
  shadow: brand.shadow,
  density: brand.density,
  weights: brand.weights,
  fonts: brand.fonts.length > 0,
};

/**
 * True once the product's bundled fonts are loaded (expo-font: web and native, no Google calls).
 * Without bundled fonts it's true at once, so nothing waits and nothing flashes.
 */
export const useAppFonts: () => boolean =
  Object.keys(bundledFonts).length > 0 ? () => useFonts(bundledFonts)[0] : () => true;
