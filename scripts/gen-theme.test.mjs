import { describe, expect, it } from "vitest";
import { hexToHslChannels, renderAppFonts, renderFontFaces, renderTheme, sizeVars } from "./gen-theme.mjs";

describe("gen-theme", () => {
  it("converts hex to HSL channels", () => {
    expect(hexToHslChannels("#ffffff")).toBe("0 0% 100%");
    expect(hexToHslChannels("#000000")).toBe("0 0% 0%");
    expect(hexToHslChannels("#2563eb")).toBe("221.2 83.2% 53.3%");
    expect(hexToHslChannels("#dc2626")).toBe("0 72.2% 50.6%");
  });

  it("renders light and dark blocks with kebab-case token names", () => {
    const css = renderTheme({
      colors: { light: { primaryForeground: "#ffffff" }, dark: { primaryForeground: "#000000" } },
      radius: "0.75rem",
    });
    expect(css).toContain(":root {\n    --primary-foreground: 0 0% 100%;\n    --radius: 0.75rem;");
    expect(css).toContain(".dark:root {\n    --primary-foreground: 0 0% 0%;");
  });

  it("writes per-element sizes; the defaults reproduce today's look (D-052)", () => {
    expect(sizeVars({ radius: "0.75rem" })).toEqual({
      "radius-card": "0.75rem",
      "radius-button": "0.75rem",
      "radius-input": "0.75rem",
      "radius-chip": "9999px",
      "radius-sheet": "0.75rem",
      "control-height": "3rem",
    });
    const css = renderTheme({
      colors: { light: {}, dark: {} },
      radius: "0.75rem",
      radii: { button: "9999px", card: "20px" },
      controlHeight: 56,
    });
    expect(css).toContain("--radius-button: 9999px;");
    expect(css).toContain("--radius-card: 20px;");
    expect(css).toContain("--radius-input: 0.75rem;");
    expect(css).toContain("--control-height: 3.5rem;");
  });

  it("self-hosts bundled fonts on the site and maps them for expo-font", () => {
    const tokens = {
      fontFamily: { sans: "Plus Jakarta Sans", heading: "Fredoka" },
      fonts: [
        { family: "Fredoka", file: "Fredoka-SemiBold.ttf", weight: 600 },
        { family: "Plus Jakarta Sans", file: "PlusJakartaSans.woff2", weight: 400 },
      ],
    };
    const faces = renderFontFaces(tokens);
    expect(faces).toContain('src: url("/fonts/Fredoka-SemiBold.ttf") format("truetype");');
    expect(faces).toContain('format("woff2")');
    expect(faces).toContain('--font-heading: "Fredoka", system-ui, sans-serif;');
    expect(faces).not.toContain("googleapis");
    expect(renderAppFonts(tokens)).toContain('"Fredoka": require("../../assets/fonts/Fredoka-SemiBold.ttf"),');
    expect(renderFontFaces({ fontFamily: { sans: "Inter" }, fonts: [] })).toBe("");
    expect(renderAppFonts({ fonts: [] })).toContain("bundledFonts: Record<string, number> = {\n};");
  });
});
