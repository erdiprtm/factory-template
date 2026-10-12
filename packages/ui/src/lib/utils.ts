import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge must know the design-token utilities (D-052), or a product's "rounded-2xl h-14"
// wouldn't replace the defaults "rounded-button h-control": both would stay, and CSS order would
// decide.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ["card", "button", "input", "chip", "sheet"],
      spacing: ["control"],
    },
  },
});

/** Merge Tailwind classes; later classes win (React Native Reusables convention). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
