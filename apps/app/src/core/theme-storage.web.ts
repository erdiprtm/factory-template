export type ThemePreference = "light" | "dark" | "system";
const KEY = "theme";

export function loadThemePreference(): ThemePreference | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "light" || v === "dark" || v === "system" ? v : null;
  } catch {
    return null;
  }
}

export function saveThemePreference(pref: ThemePreference): void {
  try {
    window.localStorage.setItem(KEY, pref);
  } catch {
    // storage blocked: preference lasts for this session only
  }
}
