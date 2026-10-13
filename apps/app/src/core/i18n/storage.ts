import { kvGet, kvSet } from "../kv";

// Native: the chosen language, kept across app restarts (core/kv, D-060), as on the web.
const KEY = "locale";

export function loadLocale(): "id" | "en" | null {
  const v = kvGet(KEY);
  return v === "id" || v === "en" ? v : null;
}

export function saveLocale(locale: "id" | "en"): void {
  kvSet(KEY, locale);
}
