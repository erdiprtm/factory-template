// Installable web app (D-080): which install path a browser has, as pure rules (tested without a
// browser). install.web.ts feeds them the real user agent, display mode and captured event.

/**
 * How this browser can install the app:
 * - "prompt": Chrome/Edge/Samsung Internet fired beforeinstallprompt; "Pasang" calls prompt();
 * - "ios": iPhone/iPad, no prompt API: Share → "Tambah ke Layar Utama" (a guide per browser, D-126);
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

/** The browsers the install guide has steps for, one collapsible row each (D-126). */
export type GuideBrowser = "safari" | "chrome-ios" | "chrome-android";
export const GUIDE_BROWSERS: readonly GuideBrowser[] = ["safari", "chrome-ios", "chrome-android"];

/** Other iOS browsers (Firefox, Edge, Opera, DuckDuckGo, Yandex): no row of their own opens. */
const OTHER_IOS = /FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo|YaBrowser/;
/** Chromium-based Android browsers that aren't Chrome. */
const OTHER_ANDROID = /EdgA|SamsungBrowser|OPR\/|YaBrowser|Firefox/;

/**
 * Which guide row opens by default for this visitor: Chrome on iOS says "CriOS"; Safari is an iOS
 * browser with none of the other browsers' tokens; Chrome on Android says "Chrome/" without
 * another Chromium browser's token. Anything else: null, every row stays collapsed.
 */
export function guideBrowser(ua: string, maxTouchPoints = 0): GuideBrowser | null {
  if (IN_APP_UA.test(ua)) return null;
  if (isIos(ua, maxTouchPoints)) {
    if (/CriOS/.test(ua)) return "chrome-ios";
    return OTHER_IOS.test(ua) ? null : "safari";
  }
  if (/Android/.test(ua) && /Chrome\//.test(ua) && !OTHER_ANDROID.test(ua)) return "chrome-android";
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
