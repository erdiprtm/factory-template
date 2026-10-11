import { createContext, createElement, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import product from "../../../../../product.config";
import { en } from "./en";
import { id, type Messages } from "./id";
import { loadLocale, saveLocale } from "./storage";

// All UI strings go through t(). Bahasa Indonesia is the default; English secondary.
export type Locale = "id" | "en";
export type MessageKey = keyof Messages;

const catalogs: Record<Locale, Messages> = { id, en };
const supported = product.locale.supported as readonly Locale[];
const fallback = product.locale.default as Locale;

function resolveInitial(): Locale {
  const saved = loadLocale();
  return saved && supported.includes(saved) ? saved : fallback;
}

/** Non-React access (e.g. outside components). Uses the product default locale. */
export function t(key: MessageKey, locale: Locale = fallback): string {
  return catalogs[locale][key] ?? catalogs[fallback][key];
}

type I18n = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: MessageKey) => string;
  supported: readonly Locale[];
};
const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(resolveInitial);
  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    saveLocale(l);
  }, []);
  const value = useMemo<I18n>(
    () => ({ locale, setLocale, t: (key) => t(key, locale), supported }),
    [locale, setLocale],
  );
  return createElement(I18nContext.Provider, { value }, children);
}

/** Locale-aware translator for components. */
export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
