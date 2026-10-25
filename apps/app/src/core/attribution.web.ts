// Web: first-touch attribution and first-party funnel events (sell engine, D-033).
// The touch (anonId, UTM tags, fbclid) is captured on the first visit, either fresh or handed
// over from the site's CTA link, and attached to the user after sign-in.
import { type ClientFunnelEvent, isClientFunnelEvent } from "@factory/core/analytics";
import { newAnonId, parseTouch, resolveTouch, type Touch } from "@factory/core/attribution/touch";
import { activeExperiment, anonIdIn } from "@factory/core/experiments";
import product from "../../../../product.config";
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

/** Forgets the in-memory touch (account deletion, D-106): the next call starts a fresh device. */
export function forgetTouch(): void {
  touch = null;
}

/** This device's touch; the first call captures it from the current URL. */
export function currentTouch(): Touch {
  if (!touch) {
    touch = devArm() ?? resolveTouch(parseTouch(read(KEY)), window.location.href);
    write(KEY, JSON.stringify(touch));
  }
  return touch;
}

/**
 * Expo dev server only (`__DEV__`, never an exported build): `?variant=<arm>` gives this device a
 * new anonId in that A/B arm (D-094), so the real assignment path runs. E2E and previews use
 * `?aid=<an id in the arm>` on a fresh device instead.
 */
function devArm(): Touch | null {
  const experiment = activeExperiment(product.experiments);
  const arm = new URL(window.location.href).searchParams.get("variant");
  if (!arm || !__DEV__ || !experiment || !(arm in experiment.variants)) return null;
  const url = new URL(window.location.href);
  url.searchParams.set("aid", anonIdIn(experiment, arm, newAnonId().slice(0, 8)));
  return resolveTouch(null, url);
}

/**
 * Attaches the touch to the signed-in user once per device and account (the API keeps the first
 * one, and claims the device's anonymous free uses for the account, D-042).
 */
export async function sendTouch(userId: string): Promise<void> {
  const t = currentTouch();
  const sent = `${t.anonId}:${userId}`;
  if (read(SENT_KEY) === sent) return;
  try {
    const res = await fetch(`${apiBaseUrl()}/api/attribution`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(t),
    });
    if (res.ok) write(SENT_KEY, sent);
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
