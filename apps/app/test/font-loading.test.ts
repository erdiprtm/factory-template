import { beforeEach, describe, expect, it, vi } from "vitest";

// D-065: on web the first screen never waits for bundled font files (they swap in); on native it
// waits until they're loaded. expo-font is mocked as "files still downloading".
const useFonts = vi.fn((_map: Record<string, unknown>) => [false, null]);
vi.mock("expo-font", () => ({ useFonts, FontDisplay: { SWAP: "swap" } }));
vi.mock("../src/core/fonts.generated", () => ({ bundledFonts: { Brand_400: 1, Brand_700: 2 } }));

beforeEach(() => {
  vi.resetModules();
  useFonts.mockClear();
});

describe("bundled font loading", () => {
  it("web: ready at once, and every face loads with font-display: swap", async () => {
    const { useBundledFonts } = await import("../src/core/font-loading.web.ts");
    expect(useBundledFonts()).toBe(true);
    expect(useFonts).toHaveBeenCalledWith({
      Brand_400: { uri: 1, display: "swap" },
      Brand_700: { uri: 2, display: "swap" },
    });
  });

  it("native: waits until the files are loaded", async () => {
    const { useBundledFonts } = await import("../src/core/font-loading.ts");
    expect(useBundledFonts()).toBe(false);
    useFonts.mockReturnValueOnce([true, null]);
    expect(useBundledFonts()).toBe(true);
  });
});
