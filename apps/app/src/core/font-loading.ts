import { useFonts } from "expo-font";
import { bundledFonts } from "./fonts.generated";

/**
 * Native: true once the product's bundled fonts are loaded. They come from the app bundle, so
 * this is quick, and waiting avoids a reflow when the face changes (D-065).
 */
export const useBundledFonts: () => boolean =
  Object.keys(bundledFonts).length > 0 ? () => useFonts(bundledFonts)[0] : () => true;
