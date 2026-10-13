import { kvGet, kvSet } from "./kv";

// Native: kept across app restarts (core/kv, D-060), under the same key as the web build.
export type ThemePreference = "light" | "dark" | "system";
const KEY = "theme";

export function loadThemePreference(): ThemePreference | null {
  const v = kvGet(KEY);
  return v === "light" || v === "dark" || v === "system" ? v : null;
}

export function saveThemePreference(pref: ThemePreference): void {
  kvSet(KEY, pref);
}
