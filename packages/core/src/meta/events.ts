// Browser-safe Meta (Facebook) Pixel helpers and the funnel → Meta event mapping (D-034).
// Marketing tracking runs only after the user consents ("iklan" toggle, UU PDP). No database
// imports here: the site and the app bundle this file.

/** Funnel/standard events that are also sent to Meta, and their Meta names. Others stay first-party. */
export const META_EVENTS = {
  lp_view: { name: "ViewContent", custom: false },
  quiz_complete: { name: "Lead", custom: false },
  signup_completed: { name: "CompleteRegistration", custom: false },
  trial_started: { name: "StartTrial", custom: false },
  checkout_start: { name: "InitiateCheckout", custom: false },
  purchase: { name: "Purchase", custom: false },
  // Not a Meta standard event, so campaigns optimizing for Purchase only learn from new buyers.
  renewal: { name: "Renewal", custom: true },
} as const satisfies Record<string, { name: string; custom: boolean }>;
export type MetaMappedEvent = keyof typeof META_EVENTS;

export const isMetaEvent = (event: string): event is MetaMappedEvent => Object.hasOwn(META_EVENTS, event);

/** The shared Pixel eventID / CAPI event_id for a payment, so Meta counts it once (D-034). */
export const paymentEventId = (paymentId: string) => paymentId;

// ---- Marketing consent on this device -------------------------------------------------------

export type MarketingChoice = "granted" | "denied";
export const MARKETING_KEY = "factory.consent.marketing";
/** Query parameter that carries the site's choice into the app (different origins). */
export const MARKETING_PARAM = "mc";

export const parseChoice = (v: unknown): MarketingChoice | null => (v === "granted" || v === "denied" ? v : null);
export const choiceToParam = (c: MarketingChoice) => (c === "granted" ? "1" : "0");
export const choiceFromParam = (v: string | null): MarketingChoice | null =>
  v === "1" ? "granted" : v === "0" ? "denied" : null;

// ---- Pixel loader ---------------------------------------------------------------------------

type Fbq = ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean; version?: string };
// Structural, so this file type-checks without the DOM lib (the Worker imports @factory/core/meta).
type PixelWindow = {
  fbq?: Fbq;
  _fbq?: Fbq;
  document: {
    createElement(tag: "script"): { async: boolean; src: string };
    head: { appendChild(n: unknown): unknown };
  };
};
const browser = () => globalThis as unknown as PixelWindow;

/**
 * Meta's base code, as a function instead of an inline script (the CSP allows script files only).
 * Idempotent. Call only after the user granted marketing consent.
 */
export function loadPixel(pixelId: string, w: PixelWindow = browser()): void {
  if (w.fbq) return;
  const queue: unknown[] = [];
  const fbq: Fbq = Object.assign(
    (...args: unknown[]) => {
      const real = (fbq as Fbq & { callMethod?: (...a: unknown[]) => void }).callMethod;
      if (real) real(...args);
      else queue.push(args);
    },
    { queue, loaded: true, version: "2.0" },
  );
  (fbq as unknown as { push: Fbq }).push = fbq;
  w.fbq = fbq;
  w._fbq ??= fbq;
  const script = w.document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  w.document.head.appendChild(script);
  fbq("init", pixelId);
  fbq("track", "PageView");
}

/** Sends a mapped event to the Pixel (no-op if it isn't loaded, i.e. no consent). */
export function pixelTrack(
  event: string,
  params: { value?: number; currency?: "IDR" } = {},
  eventId?: string,
  w: PixelWindow = browser(),
): void {
  if (!w.fbq || !isMetaEvent(event)) return;
  const meta = META_EVENTS[event];
  w.fbq(meta.custom ? "trackCustom" : "track", meta.name, params, eventId ? { eventID: eventId } : undefined);
}

/** An fbp/fbc value in Meta's format (fb.<subdomain index>.<ms>.<id>), or undefined. */
export const cleanFbId = (v: unknown): string | undefined =>
  typeof v === "string" && /^fb\.\d\.\d+\.[\w.-]{1,500}$/.test(v) ? v : undefined;

/** The Pixel's first-party cookies, sent with checkout so the server event matches the browser. */
export function readFbCookies(cookie: string): { fbp?: string; fbc?: string } {
  const get = (name: string) => cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1];
  return { fbp: cleanFbId(get("_fbp")), fbc: cleanFbId(get("_fbc")) };
}
