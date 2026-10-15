// Installable web app (D-080): which install path a browser has, as pure rules (tested without a
// browser). install.web.ts feeds them the real user agent, display mode and captured event.

/**
 * How this browser can install the app:
 * - "prompt": Chrome/Edge/Samsung Internet fired beforeinstallprompt; "Pasang" calls prompt();
 * - "ios": iPhone/iPad, no prompt API: Share → "Tambah ke Layar Utama" (a guide);
 * - "inapp": an app's own browser (Instagram, Facebook, LINE, Gmail/Google app, Android WebView),
 *   which can't install: open the link in Chrome or Safari;
 * - null: already installed, or nothing to offer (desktop Firefox, Chrome before its event).
 */
export type InstallKind = "prompt" | "ios" | "inapp";

/** In-app browsers: Facebook (FBAN/FBAV), Instagram, LINE, the Google app (GSA, also Gmail's links), Android WebView. */
export const IN_APP_UA = /FBAN|FBAV|Instagram|Line\/|GSA\/|; wv\)/;

/** iPhone, iPod, iPad, and iPadOS's desktop-class Safari (a Mac user agent with touch). */
export function isIos(ua: string, maxTouchPoints = 0): boolean {
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
}

export function installKind(env: {
  ua: string;
  maxTouchPoints?: number;
  /** display-mode: standalone matches, or iOS navigator.standalone. */
  standalone: boolean;
  /** A beforeinstallprompt event is held. */
  hasPrompt: boolean;
}): InstallKind | null {
  if (env.standalone) return null;
  if (IN_APP_UA.test(env.ua)) return "inapp";
  if (env.hasPrompt) return "prompt";
  if (isIos(env.ua, env.maxTouchPoints)) return "ios";
  return null;
}

/** "Nanti saja" hides the offer for this long. */
export const DISMISS_DAYS = 14;
export const DISMISS_KEY = "factory.pwa.dismissedAt";

/** Whether a "Nanti saja" stored at `stored` (ms since epoch, as a string) still hides the offer. */
export function dismissedRecently(stored: string | null, now: number): boolean {
  const at = Number(stored);
  if (!stored || !Number.isFinite(at)) return false;
  return now - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
}
