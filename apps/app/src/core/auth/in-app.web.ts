// Web: the in-app browser escape (D-121). Rules in ./in-app-rules; this file touches the window.
import { ANON_PARAM, isAnonId, resolveTouch, withTouch } from "@factory/core/attribution/touch";
import { choiceToParam, MARKETING_PARAM } from "@factory/core/meta/events";
import product from "../../../../../product.config";
import { adoptTouch, currentTouch } from "../attribution";
import { marketingChoice } from "../marketing";
import {
  CARRY_KEY,
  decodeCarry,
  detectInApp,
  ESCAPE_PARAM,
  encodeCarry,
  escapeHref,
  type InApp,
  isCarriedKey,
} from "./in-app-rules";

/** The in-app browser this page runs in, when the product offers the escape (auth.inAppEscape). */
export function currentInApp(): InApp | null {
  if (!product.auth.inAppEscape) return null;
  try {
    return detectInApp(navigator.userAgent);
  } catch {
    return null;
  }
}

/** This page in the visitor's real browser: same anonId and attribution, plus the quiz progress. */
export function escapeTarget(): string {
  const touch = currentTouch();
  const url = new URL(touch ? withTouch(window.location.href, touch) : window.location.href);
  url.searchParams.set(ESCAPE_PARAM, "1");
  const choice = marketingChoice();
  if (choice) url.searchParams.set(MARKETING_PARAM, choiceToParam(choice));
  const items: Record<string, string> = {};
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      const value = key && isCarriedKey(key) ? window.localStorage.getItem(key) : null;
      if (key && value !== null) items[key] = value;
    }
  } catch {}
  url.hash = `${CARRY_KEY}=${encodeCarry({ items, landingPath: touch?.landingPath })}`;
  return url.toString();
}

/** Asks the phone to open the target outside. False when there is no known way for this app. */
export function openOutside(inApp: InApp, target: string): boolean {
  const href = escapeHref(target, inApp);
  if (!href) return false;
  window.location.href = href;
  return true;
}

export async function copyLink(target: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(target);
    return true;
  } catch {
    return false;
  }
}

const DONE_KEY = "factory.escape.done";

/**
 * Root layout, before the touch is read: a page opened by an escape link takes over the in-app
 * browser's anonId and device state. Once only per link: a reload keeps the progress made since.
 */
export function restoreEscape(): void {
  const url = new URL(window.location.href);
  if (url.searchParams.get(ESCAPE_PARAM) !== "1" || !isAnonId(url.searchParams.get(ANON_PARAM))) return;
  const fx = new URLSearchParams(url.hash.slice(1)).get(CARRY_KEY);
  try {
    if (window.localStorage.getItem(DONE_KEY) === `${url.searchParams.get(ANON_PARAM)}:${fx}`) return;
    window.localStorage.setItem(DONE_KEY, `${url.searchParams.get(ANON_PARAM)}:${fx}`);
  } catch {}
  const carry = decodeCarry(fx);
  try {
    for (const [key, value] of Object.entries(carry?.items ?? {})) window.localStorage.setItem(key, value);
  } catch {}
  const touch = resolveTouch(null, url);
  adoptTouch(carry?.landingPath ? { ...touch, landingPath: carry.landingPath } : touch);
}

/**
 * Drops the escape flag and the carried state from the address bar, so the link isn't shared or
 * bookmarked with them. Called once the router is up: it writes back the URL it started with.
 */
export function cleanEscapeUrl(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(ESCAPE_PARAM) && !url.hash.includes(`${CARRY_KEY}=`)) return;
  url.searchParams.delete(ESCAPE_PARAM);
  url.hash = "";
  try {
    window.history.replaceState(window.history.state, "", url.toString());
  } catch {}
}
