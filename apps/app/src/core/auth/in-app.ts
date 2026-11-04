// Native: an installed app is never inside another app's browser, so there is nothing to escape (D-121).
import type { InApp } from "./in-app-rules";

export function currentInApp(): InApp | null {
  return null;
}
export function escapeTarget(): string {
  return "";
}
export function openOutside(_inApp: InApp, _target: string): boolean {
  return false;
}
export async function copyLink(_target: string): Promise<boolean> {
  return false;
}
export function restoreEscape(): void {}
export function cleanEscapeUrl(): void {}
