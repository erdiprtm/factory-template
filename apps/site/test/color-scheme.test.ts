import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { colorSchemeHead } from "../src/lib/color-scheme.mjs";

// D-076: light-only products (brand.darkMode false) load no /theme.js and say color-scheme "light".
describe("color scheme in <head>", () => {
  it("dark mode (default): /theme.js, no color-scheme meta, as before", () => {
    expect(colorSchemeHead(true)).toEqual({ themeScript: true, colorScheme: null });
  });

  it("light only: no /theme.js, color-scheme light", () => {
    expect(colorSchemeHead(false)).toEqual({ themeScript: false, colorScheme: "light" });
  });

  it("Base.astro takes both from the helper", () => {
    const base = readFileSync(new URL("../src/layouts/Base.astro", import.meta.url), "utf8");
    expect(base).toContain("colorSchemeHead(product.brand.darkMode)");
    expect(base).toContain('{scheme.themeScript && <script is:inline src="/theme.js"></script>}');
    expect(base).toContain('<meta name="color-scheme" content={scheme.colorScheme} />');
  });
});
