// Native: no ad attribution yet (installs are attributed by the stores). Phase 10 adds it.
import type { Touch } from "@factory/core/attribution/touch";

export function currentTouch(): Touch | null {
  return null;
}
export async function sendTouch(): Promise<void> {}
export function trackFunnel(_event: string, _step?: number): void {}
