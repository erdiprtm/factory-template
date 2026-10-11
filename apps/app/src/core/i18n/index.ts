import product from "../../../../../product.config";
import { en } from "./en";
import { id, type Messages } from "./id";

// Minimal i18n until Phase 5 brings the full setup. All UI strings go through t().
const catalogs: Record<"id" | "en", Messages> = { id, en };

export type MessageKey = keyof Messages;

export function t(key: MessageKey, locale: "id" | "en" = product.locale.default): string {
  return catalogs[locale][key];
}
