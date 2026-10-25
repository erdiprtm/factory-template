// Native: no Meta Pixel (store installs are measured by the stores and Meta's app SDK, Phase 10).
import type { MarketingChoice } from "@factory/core/meta/events";

export const marketingActive = async () => false;
export const marketingChoice = (): MarketingChoice | null => null;
export const onMarketingChange = (_listener: () => void) => () => {};
export function notifyMarketingChange(): void {}
export async function initMarketing(): Promise<void> {}
export function setMarketingChoice(_choice: MarketingChoice, _synced = false): void {}
export async function syncMarketingConsent(_serverGranted: boolean): Promise<void> {}
export function metaTrack(_event: string, _params?: { value?: number; currency?: "IDR" }, _eventId?: string): void {}
export const fbIds = (): { fbp?: string; fbc?: string } => ({});
