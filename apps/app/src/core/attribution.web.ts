// Web: first-touch attribution and first-party funnel events (sell engine, D-033).
// The touch (anonId, UTM tags, fbclid) is captured on the first visit, either fresh or handed
// over from the site's CTA link, and attached to the user after sign-in.
import { type ClientFunnelEvent, isClientFunnelEvent } from "@factory/core/analytics";
import { parseTouch, resolveTouch, type Touch } from "@factory/core/attribution/touch";
import { apiBaseUrl } from "./api-base";

const KEY = "factory.touch";
const SENT_KEY = "factory.touch.sent";

let touch: Touch | null = null;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage blocked: the touch lasts for this page load only
  }
}

/** This device's touch; the first call captures it from the current URL. */
export function currentTouch(): Touch {
  if (!touch) {
    touch = resolveTouch(parseTouch(read(KEY)), window.location.href);
    write(KEY, JSON.stringify(touch));
  }
  return touch;
}

/** Attaches the touch to the signed-in user once per device (the API keeps the first one). */
export async function sendTouch(): Promise<void> {
  const t = currentTouch();
  if (read(SENT_KEY) === t.anonId) return;
  try {
    const res = await fetch(`${apiBaseUrl()}/api/attribution`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(t),
    });
    if (res.ok) write(SENT_KEY, t.anonId);
  } catch {
    // retried on the next app start
  }
}

/** Records a funnel step first-party. Best effort: sendBeacon survives navigation to checkout. */
export function trackFunnel(event: string, step?: number): void {
  if (!isClientFunnelEvent(event)) return;
  const t = currentTouch();
  const body = JSON.stringify({
    anonId: t.anonId,
    utm_source: t.utm_source,
    utm_campaign: t.utm_campaign,
    events: [{ event: event as ClientFunnelEvent, ...(step === undefined ? {} : { step }) }],
  });
  const url = `${apiBaseUrl()}/api/events`;
  try {
    if (navigator.sendBeacon?.(url, new Blob([body], { type: "text/plain" }))) return;
  } catch {}
  void fetch(url, { method: "POST", body, keepalive: true, headers: { "content-type": "text/plain" } }).catch(() => {});
}
