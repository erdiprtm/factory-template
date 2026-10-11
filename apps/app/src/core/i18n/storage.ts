// Native: in-memory until Phase 10 adds persistent storage (expo-secure-store / AsyncStorage).
let current: "id" | "en" | null = null;

export function loadLocale(): "id" | "en" | null {
  return current;
}

export function saveLocale(locale: "id" | "en"): void {
  current = locale;
}
