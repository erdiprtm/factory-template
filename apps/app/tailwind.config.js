// Tailwind v3 for NativeWind v4. Colors come from CSS variables generated from
// product.config.ts (theme.css), in React Native Reusables' token names.
const path = require("node:path");
const { hairlineWidth } = require("nativewind/theme");

const token = (name) => `hsl(var(--${name}) / <alpha-value>)`;

// Bundled fonts (D-052, D-057). Every file is registered as "<family>_<weight>" (expo-font, web and
// native: native picks a font by file, not by font-weight), and gets a class per role and weight:
// font-sans-400, font-heading-800, … @factory/ui picks the class for each text's weight. They are
// built from config, so the content scan can't see them: hence the safelist. Without bundled fonts
// nothing changes (the platform's default font).
//
// Each family ends in a fallback stack (D-065): web renders before the files arrive and swaps them
// in, so text is readable meanwhile. Native only uses the first name, the bundled file.
const brand = require("./src/core/product.generated.json").brand.tokens;
const fontFamily = {};
const FALLBACK = ["system-ui", "sans-serif"];
const fontSafelist = [];
if (brand.fonts.length > 0) {
  const roles = { sans: brand.fontFamily.sans, heading: brand.fontFamily.heading ?? brand.fontFamily.sans };
  for (const [role, family] of Object.entries(roles)) {
    const files = brand.fonts.filter((f) => f.family === family);
    for (const f of files) {
      fontFamily[`${role}-${f.weight}`] = [`${f.family}_${f.weight}`, ...FALLBACK];
      fontSafelist.push(`font-${role}-${f.weight}`);
    }
    // The plain role class uses the family's lightest file (the regular one, usually).
    const base = [...files].sort((a, b) => a.weight - b.weight)[0];
    if (base) {
      fontFamily[role] = [`${base.family}_${base.weight}`, ...FALLBACK];
      fontSafelist.push(`font-${role}`);
    }
  }
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [path.join(__dirname, "src/**/*.{ts,tsx}"), path.join(__dirname, "../../packages/ui/src/**/*.{ts,tsx}")],
  safelist: fontSafelist,
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        border: token("border"),
        input: token("input"),
        ring: token("ring"),
        background: token("background"),
        foreground: token("foreground"),
        primary: { DEFAULT: token("primary"), foreground: token("primary-foreground") },
        secondary: { DEFAULT: token("secondary"), foreground: token("secondary-foreground") },
        destructive: { DEFAULT: token("destructive"), foreground: token("destructive-foreground") },
        muted: { DEFAULT: token("muted"), foreground: token("muted-foreground") },
        accent: { DEFAULT: token("accent"), foreground: token("accent-foreground") },
        popover: { DEFAULT: token("popover"), foreground: token("popover-foreground") },
        card: { DEFAULT: token("card"), foreground: token("card-foreground") },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // Per element (D-052): generated from brand.tokens.radii, defaulting to --radius.
        card: "var(--radius-card)",
        button: "var(--radius-button)",
        input: "var(--radius-input)",
        chip: "var(--radius-chip)",
        sheet: "var(--radius-sheet)",
      },
      height: { control: "var(--control-height)" },
      minHeight: { control: "var(--control-height)" },
      fontFamily,
      borderWidth: { hairline: hairlineWidth() },
    },
  },
  future: { hoverOnlyWhenSupported: true },
  plugins: [require("tailwindcss-animate")],
};
