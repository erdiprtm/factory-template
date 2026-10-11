import { describe, expect, it } from "vitest";
import { hexToHslChannels, renderTheme } from "./gen-theme.mjs";

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
});
