// In-app browser escape (D-121): the pure half, so it runs in tests and on any platform.
// Instagram, Facebook, Threads and TikTok open links in their own browser. A magic link opened
// from the email app lands in another browser, without this one's session, quiz progress or
// anonId, so sign-in offers to continue in the visitor's real browser first.

export type InAppApp = "instagram" | "facebook" | "threads" | "tiktok";
export type InApp = { app: InAppApp; os: "android" | "ios" | "other" };

/** Query flag on the escape link: the browser it opens adopts the handed anonId (D-121). */
export const ESCAPE_PARAM = "hx";
/** Fragment key for the carried device state: a fragment never reaches the server or its logs. */
export const CARRY_KEY = "fx";
/** Longest encoded state carried; past it the quiz progress is dropped (the anonId still goes). */
export const CARRY_MAX = 3000;

/** Which app's in-app browser this user agent is, if any. Threads first: its UA also says Instagram. */
export function detectInApp(ua: string): InApp | null {
  const app: InAppApp | null = /\bBarcelona\b/.test(ua)
    ? "threads"
    : /\bInstagram\b/.test(ua)
      ? "instagram"
      : /\bFB(AN|AV|_IAB)\b/.test(ua)
        ? "facebook"
        : /musical_ly|BytedanceWebview|\btrill\b|TikTok/i.test(ua)
          ? "tiktok"
          : null;
  if (!app) return null;
  const os = /Android/i.test(ua) ? "android" : /iPhone|iPad|iPod/.test(ua) ? "ios" : "other";
  return { app, os };
}

/**
 * The link that asks the phone to open `target` in the default browser, or null when there is no
 * known way (the screen then shows "⋯ → Buka di browser" and a copy button). The schemes are
 * undocumented and change: Android's intent without a package opens the default browser;
 * Instagram on iOS has its own extbrowser; Safari's x-safari-https works from the others. Only
 * followed on a tap: in-app browsers ignore scripted navigation to other apps after load.
 */
export function escapeHref(target: string, inApp: InApp): string | null {
  const url = new URL(target);
  if (inApp.os === "android") {
    const scheme = url.protocol.slice(0, -1);
    // Android reads the intent part after the LAST "#", so the target's own fragment survives.
    return `intent://${url.host}${url.pathname}${url.search}${url.hash}#Intent;scheme=${scheme};end`;
  }
  if (inApp.os === "ios") {
    if (inApp.app === "instagram") return `instagram://extbrowser/?url=${encodeURIComponent(url.toString())}`;
    return `x-safari-${url.toString()}`;
  }
  return null;
}

/** Device state the external browser picks up: quiz progress, where to go after sign-in, first result. */
export type Carry = {
  /** Raw localStorage values by key (only the keys `isCarriedKey` allows). */
  items: Record<string, string>;
  /** The first visit's landing path, kept as the adopted touch's. */
  landingPath?: string;
};

const CARRIED = /^factory\.(quiz\.[A-Za-z0-9_-]{1,60}|afterSignIn|firstResult)$/;
export const isCarriedKey = (key: string): boolean => CARRIED.test(key);

function toBase64Url(text: string): string {
  let bin = "";
  for (const byte of new TextEncoder().encode(text)) bin += String.fromCharCode(byte);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
function fromBase64Url(value: string): string {
  const bin = atob(value.replaceAll("-", "+").replaceAll("_", "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Encodes the state for the fragment; over CARRY_MAX the quiz progress is left out. */
export function encodeCarry(carry: Carry): string {
  const items = Object.fromEntries(Object.entries(carry.items).filter(([k]) => isCarriedKey(k)));
  const full = toBase64Url(JSON.stringify({ ...carry, items }));
  if (full.length <= CARRY_MAX) return full;
  const small = Object.fromEntries(Object.entries(items).filter(([k]) => !k.startsWith("factory.quiz.")));
  return toBase64Url(JSON.stringify({ ...carry, items: small }));
}

/** Decodes a carried state defensively: anything malformed or not allowed is dropped. */
export function decodeCarry(value: string | null): Carry | null {
  if (!value || value.length > CARRY_MAX * 2) return null;
  try {
    const raw = JSON.parse(fromBase64Url(value)) as { items?: unknown; landingPath?: unknown };
    if (!raw || typeof raw.items !== "object" || raw.items === null) return null;
    const items: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.items)) {
      if (isCarriedKey(k) && typeof v === "string" && v.length <= CARRY_MAX) items[k] = v;
    }
    const carry: Carry = { items };
    if (typeof raw.landingPath === "string" && raw.landingPath.startsWith("/"))
      carry.landingPath = raw.landingPath.slice(0, 300);
    return carry;
  } catch {
    return null;
  }
}
