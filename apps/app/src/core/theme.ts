import { useColorScheme } from "nativewind";
import { useEffect } from "react";
import { Appearance } from "react-native";
import { loadThemePreference, saveThemePreference, type ThemePreference } from "./theme-storage";

export type { ThemePreference };

// NativeWind's class mode doesn't apply the `dark` class for "system" on web, so "system" is
// resolved here (Appearance works on web and native) and passed on as an explicit light/dark.
const resolve = (pref: ThemePreference): "light" | "dark" =>
  pref === "system" ? (Appearance.getColorScheme() === "dark" ? "dark" : "light") : pref;

/** Light/dark/system, persisted per device. */
export function useThemePreference() {
  const { colorScheme, setColorScheme } = useColorScheme();
  const set = (pref: ThemePreference) => {
    saveThemePreference(pref);
    setColorScheme(resolve(pref));
  };
  return { colorScheme: colorScheme ?? "light", set, current: loadThemePreference() ?? "system" };
}

/** Applies the saved preference (default: follow the device) and tracks device changes. */
export function useRestoreTheme() {
  const { setColorScheme } = useColorScheme();
  useEffect(() => {
    setColorScheme(resolve(loadThemePreference() ?? "system"));
    const sub = Appearance.addChangeListener(() => {
      if ((loadThemePreference() ?? "system") === "system") setColorScheme(resolve("system"));
    });
    return () => sub.remove();
  }, [setColorScheme]);
}
