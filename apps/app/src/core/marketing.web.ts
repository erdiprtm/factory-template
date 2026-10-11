// Web: Meta Pixel behind the "iklan/marketing" consent (UU PDP, D-034). Production only, like
// OpenPanel. No choice yet → no Pixel; the banner asks. The choice can come from the site's CTA
// link (?mc=1|0) so a visitor isn't asked twice, and is recorded in the consents table at sign-in.
import {
  choiceFromParam,
  loadPixel,
  MARKETING_KEY,
  MARKETING_PARAM,
  type MarketingChoice,
  parseChoice,
  pixelTrack,
  readFbCookies,
} from "@factory/core/meta/events";
import product from "../../../../product.config";
import { apiBaseUrl } from "./api-base";
import { deployInfo } from "./deploy-env";

type Stored = { choice: MarketingChoice; synced: boolean };
const listeners = new Set<() => void>();
let active: Promise<boolean> | null = null;

function read(): Stored | null {
  try {
    const raw = JSON.parse(window.localStorage.getItem(MARKETING_KEY) ?? "null") as Partial<Stored> | null;
    const choice = parseChoice(raw?.choice);
    return choice ? { choice, synced: raw?.synced === true } : null;
  } catch {
    return null;
  }
}
function write(s: Stored): void {
  try {
    window.localStorage.setItem(MARKETING_KEY, JSON.stringify(s));
  } catch {}
  for (const l of listeners) l();
}

/** Whether this build tracks for ads at all: a Pixel ID and a production deploy. */
export function marketingActive(): Promise<boolean> {
  active ??= (async () => Boolean(product.marketing.metaPixelId) && (await deployInfo()).env === "production")();
  return active;
}

/** This device's choice; the first call adopts one handed over by the site's link. */
export function marketingChoice(): MarketingChoice | null {
  const stored = read();
  if (stored) return stored.choice;
  const handed = choiceFromParam(new URL(window.location.href).searchParams.get(MARKETING_PARAM));
  if (handed) write({ choice: handed, synced: false });
  return handed;
}

export function onMarketingChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Starts the Pixel if the user said yes (root layout). */
export async function initMarketing(): Promise<void> {
  const pixelId = product.marketing.metaPixelId;
  if (pixelId && marketingChoice() === "granted" && (await marketingActive())) loadPixel(pixelId);
}

/** Records a choice on this device; `synced` once the API has it too. Withdrawing stops the Pixel on next load. */
export function setMarketingChoice(choice: MarketingChoice, synced = false): void {
  write({ choice, synced });
  void initMarketing();
}

/** After sign-in: a choice made before signup goes to the API once; after that the account's wins. */
export async function syncMarketingConsent(serverGranted: boolean): Promise<void> {
  const stored = read();
  if (stored && !stored.synced) {
    const res = await fetch(`${apiBaseUrl()}/api/consents/marketing`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ granted: stored.choice === "granted" }),
    }).catch(() => null);
    if (res?.ok) write({ ...stored, synced: true });
    return;
  }
  const server: MarketingChoice = serverGranted ? "granted" : "denied";
  if (!stored ? serverGranted : stored.choice !== server) setMarketingChoice(server, true);
}

/** Mapped funnel events to the Pixel (a no-op without consent: the Pixel isn't loaded). */
export function metaTrack(event: string, params?: { value?: number; currency?: "IDR" }, eventId?: string): void {
  pixelTrack(event, params, eventId);
}

/** The Pixel's cookies, sent with checkout so the server's CAPI event matches this browser. */
export function fbIds(): { fbp?: string; fbc?: string } {
  return readFbCookies(document.cookie);
}
