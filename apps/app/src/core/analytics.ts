// Native: no analytics yet. Phase 10 adds @openpanel/react-native behind these same functions.
import type { AnalyticsEvent, EventProps } from "@factory/core/analytics";

export function initAnalytics(): Promise<void> {
  return Promise.resolve();
}
export function track(_event: AnalyticsEvent, _props?: EventProps): void {}
export function identify(_userId: string): void {}
export function resetAnalytics(): void {}
