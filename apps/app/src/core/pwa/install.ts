// Native: the app is already an app, so nothing to install (D-080). Same exports as install.web.ts.
import type { InstallKind } from "./rules";

export function initPwa(): void {}
export function currentInstallKind(): InstallKind | null {
  return null;
}
export function useInstallKind(): InstallKind | null {
  return null;
}
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  return "unavailable";
}
export function offerDismissed(_now?: number): boolean {
  return true;
}
export function dismissOffer(_now?: number): void {}
export function appLink(): string {
  return "";
}
export async function copyText(_text: string): Promise<boolean> {
  return false;
}
export function resetPwaForTests(): void {}
