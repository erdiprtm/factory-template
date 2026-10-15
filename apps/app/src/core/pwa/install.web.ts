import { useSyncExternalStore } from "react";
import product from "../../../../../product.config";
import { track } from "../analytics";
import { kvGet, kvSet } from "../kv";
import { DISMISS_KEY, dismissedRecently, type InstallKind, installKind } from "./rules";

// Installable web app (D-080), web side. Chrome-family browsers fire beforeinstallprompt once the
// site is installable (manifest, HTTPS, some engagement; no service worker needed): we keep the
// event and our own "Pasang" button calls prompt(). iOS has no such API: the card shows a guide.

/** Chrome's BeforeInstallPromptEvent (not in TypeScript's DOM types). */
type InstallPromptEvent = Event & {
  prompt(): Promise<unknown>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let held: InstallPromptEvent | null = null;
let installed = false;
let started = false;
let version = 0;
const listeners = new Set<() => void>();
const changed = () => {
  version++;
  for (const l of listeners) l();
};

/**
 * Starts listening (root layout, during its first render so the start URL's query is still
 * there). Idempotent. Tracks pwa_open when the app was opened from the home-screen icon
 * (start_url "/?source=pwa") and pwa_installed when the browser reports an install.
 */
export function initPwa(): void {
  if (started || !product.pwa.enabled || typeof window === "undefined") return;
  started = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // no browser mini-infobar: our card or the Akun link offers it
    held = e as InstallPromptEvent;
    changed();
  });
  window.addEventListener("appinstalled", () => {
    held = null;
    installed = true;
    track("pwa_installed");
    changed();
  });
  try {
    if (new URLSearchParams(window.location.search).get("source") === "pwa") track("pwa_open");
  } catch {}
}

function standalone(): boolean {
  try {
    if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  } catch {}
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** How this browser can install the app right now (rules.ts), or null. */
export function currentInstallKind(): InstallKind | null {
  if (!product.pwa.enabled || installed || typeof navigator === "undefined") return null;
  return installKind({
    ua: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: standalone(),
    hasPrompt: held !== null,
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** currentInstallKind, re-rendering when the browser's event arrives or the app gets installed. */
export function useInstallKind(): InstallKind | null {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => version,
  );
  return currentInstallKind();
}

/** Shows the browser's install dialog (once per event: Chrome sends a new one if it's declined). */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const event = held;
  if (!event) return "unavailable";
  held = null;
  changed();
  try {
    await event.prompt();
    return (await event.userChoice).outcome;
  } catch {
    return "unavailable";
  }
}

/** Whether "Nanti saja" was tapped in the last 14 days. */
export function offerDismissed(now = Date.now()): boolean {
  return dismissedRecently(kvGet(DISMISS_KEY), now);
}

export function dismissOffer(now = Date.now()): void {
  kvSet(DISMISS_KEY, String(now));
}

/** The link to copy in an in-app browser: the app's start, for Chrome or Safari. */
export function appLink(): string {
  return `${window.location.origin}/`;
}

/** Copies text; falls back to a selected textarea where the Clipboard API is missing (webviews). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Tests only: forget the held event and listeners' state. */
export function resetPwaForTests(): void {
  held = null;
  installed = false;
  started = false;
  changed();
}
