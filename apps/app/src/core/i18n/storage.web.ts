// Web: remember the chosen language in localStorage (a per-device convenience).
const KEY = "locale";

export function loadLocale(): "id" | "en" | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "id" || v === "en" ? v : null;
  } catch {
    return null;
  }
}

export function saveLocale(locale: "id" | "en"): void {
  try {
    window.localStorage.setItem(KEY, locale);
  } catch {
    // storage blocked (private mode): the choice lasts for this session only
  }
}
