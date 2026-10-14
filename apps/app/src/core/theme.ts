import { useColorScheme } from "nativewind";
import { useEffect } from "react";
import { Appearance } from "react-native";
import product from "../../../../product.config";
import { loadThemePreference, saveThemePreference, type ThemePreference } from "./theme-storage";

export type { ThemePreference };

/** false = a light-only product (brand.darkMode, D-076): never dark, whatever is stored or the device says. */
export const darkModeEnabled = product.brand.darkMode;

/** The stored preference; a light-only product always reads "light" (a stored "dark"/"system" is ignored). */
const stored = (): ThemePreference => (darkModeEnabled ? (loadThemePreference() ?? "system") : "light");

// NativeWind's class mode doesn't apply the `dark` class for "system" on web, so "system" is
// resolved here (Appearance works on web and native) and passed on as an explicit light/dark.
const resolve = (pref: ThemePreference): "light" | "dark" => {
  if (!darkModeEnabled) return "light";
  return pref === "system" ? (Appearance.getColorScheme() === "dark" ? "dark" : "light") : pref;
};

/** Light/dark/system, persisted per device. */
export function useThemePreference() {
  const { colorScheme, setColorScheme } = useColorScheme();
  const set = (pref: ThemePreference) => {
    if (!darkModeEnabled) return;
    saveThemePreference(pref);
    setColorScheme(resolve(pref));
  };
  return {
    colorScheme: darkModeEnabled ? (colorScheme ?? "light") : ("light" as const),
    set,
    current: stored(),
  };
}

/** Applies the saved preference (default: follow the device) and tracks device changes. */
export function useRestoreTheme() {
  const { setColorScheme } = useColorScheme();
  useEffect(() => {
    setColorScheme(resolve(stored()));
    if (!darkModeEnabled) return;
    const sub = Appearance.addChangeListener(() => {
      if (stored() === "system") setColorScheme(resolve("system"));
    });
    return () => sub.remove();
  }, [setColorScheme]);
}
