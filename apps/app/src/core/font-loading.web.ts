import { FontDisplay, useFonts } from "expo-font";
import { bundledFonts } from "./fonts.generated";

// Web: never wait for font files (D-065). The first screen renders at once in the fallback stack
// (tailwind.config.js: "<family>_<weight>", system-ui, sans-serif) and swaps to the bundled face
// when it arrives (font-display: swap). Waiting cost Myna Fit 9 Lighthouse points and 1.4 s of LCP.
const swapping = Object.fromEntries(
  Object.entries(bundledFonts).map(([name, uri]) => [name, { uri, display: FontDisplay.SWAP }]),
);

/** Always true on web; the bundled fonts load in the background. */
export const useBundledFonts: () => boolean =
  Object.keys(swapping).length > 0
    ? () => {
        useFonts(swapping);
        return true;
      }
    : () => true;
