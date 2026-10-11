// Native: in-memory until Phase 10 adds persistent storage.
export type ThemePreference = "light" | "dark" | "system";
let current: ThemePreference | null = null;

export function loadThemePreference(): ThemePreference | null {
  return current;
}

export function saveThemePreference(pref: ThemePreference): void {
  current = pref;
}
