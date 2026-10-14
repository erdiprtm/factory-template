import { render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// D-076: brand.darkMode false = a light-only product. Akun shows no Tampilan row, and the app never
// applies the dark scheme, whatever an earlier build stored on this device.
// nativewind and expo-router ship untranspiled code; tests only need their hooks.
const scheme = vi.hoisted(() => ({ set: [] as string[] }));
vi.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "dark", setColorScheme: (s: string) => scheme.set.push(s) }),
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
async function load(darkMode: boolean) {
  vi.resetModules();
  vi.doMock("../../../product.config", async (importOriginal) => {
    const real = (await importOriginal<typeof import("../../../product.config")>()).default;
    return { default: { ...real, brand: { ...real.brand, darkMode } } };
  });
  const { Preferences } = await import("../src/core/signed-in/account");
  const { I18nProvider } = await import("../src/core/i18n");
  const theme = await import("../src/core/theme");
  render(
    <I18nProvider>
      <Preferences />
    </I18nProvider>,
  );
  return theme;
}

afterEach(() => {
  scheme.set.length = 0;
  vi.doUnmock("../../../product.config");
  window.localStorage.clear();
});

describe("Akun preferences and brand.darkMode", () => {
  it("light-only: no Tampilan row, and a stored 'dark' is ignored", async () => {
    window.localStorage.setItem("theme", "dark");
    const theme = await load(false);
    expect(screen.getByText("Bahasa")).toBeTruthy();
    expect(screen.queryByText("Tampilan")).toBeNull();
    expect(screen.queryByText("Gelap")).toBeNull();
    const { result } = renderHook(() => theme.useThemePreference());
    expect(result.current.current).toBe("light");
    expect(result.current.colorScheme).toBe("light");
    result.current.set("dark");
    expect(window.localStorage.getItem("theme")).toBe("dark"); // untouched: set is a no-op
    expect(renderHook(() => theme.useThemePreference()).result.current.current).toBe("light");
    renderHook(() => theme.useRestoreTheme());
    expect(scheme.set).toEqual(["light"]); // never the stored "dark"
  });

  it("with dark mode (the default): Tampilan offers Terang / Gelap / Ikuti perangkat", async () => {
    const theme = await load(true);
    expect(screen.getByText("Tampilan")).toBeTruthy();
    expect(screen.getByText("Terang")).toBeTruthy();
    expect(screen.getByText("Gelap")).toBeTruthy();
    expect(screen.getByText("Ikuti perangkat")).toBeTruthy();
    window.localStorage.setItem("theme", "dark");
    renderHook(() => theme.useRestoreTheme());
    expect(scheme.set).toEqual(["dark"]);
  });
});
