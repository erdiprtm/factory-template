// Meta Conversions API (server side, D-034). Purchase and renewal are sent from the payment
// webhook after the payment is confirmed, never from the browser alone, and only for users with
// an active marketing consent. Follows https://developers.facebook.com/docs/marketing-api/conversions-api
// (read 2026-10-11): POST /{API_VERSION}/{PIXEL_ID}/events, user_data hashed per Meta's rules.
import { paymentTracking } from "@factory/db";
import { eq, lt } from "drizzle-orm";
import type { Db } from "../entitlements";
import { META_EVENTS } from "./events";

export * from "./events";

export const GRAPH_API_VERSION = "v25.0";

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Meta: "Trim any leading and trailing spaces. Convert all characters to lowercase." */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** fbc from a stored fbclid (no _fbc cookie): fb.1.<first seen, ms>.<fbclid, unmodified>. */
export const fbcFromClick = (fbclid: string, seenAtMs: number) => `fb.1.${seenAtMs}.${fbclid}`;

export type CapiInput = {
  event: "purchase" | "renewal";
  eventId: string;
  eventTime: Date;
  eventSourceUrl: string;
  email: string;
  userId: string;
  valueIdr: number;
  fbp?: string | null;
  fbc?: string | null;
  clientIp?: string | null;
  userAgent: string;
};

/** One server event in Meta's format. Email and external_id hashed; fbp/fbc/IP/UA never hashed. */
export async function capiEvent(input: CapiInput) {
  const userData: Record<string, unknown> = {
    em: [await sha256Hex(normalizeEmail(input.email))],
    external_id: [await sha256Hex(input.userId)],
    client_user_agent: input.userAgent,
  };
  if (input.fbp) userData.fbp = input.fbp;
  if (input.fbc) userData.fbc = input.fbc;
  if (input.clientIp) userData.client_ip_address = input.clientIp;
  return {
    event_name: META_EVENTS[input.event].name,
    event_time: Math.floor(input.eventTime.getTime() / 1000),
    event_id: input.eventId,
    action_source: "website",
    event_source_url: input.eventSourceUrl,
    user_data: userData,
    // Integer IDR; Meta reads value in the currency's major unit.
    custom_data: { value: input.valueIdr, currency: "IDR" },
  };
}

export type CapiOptions = {
  pixelId: string;
  accessToken: string;
  /** Events Manager → Test events code. Set only while testing; never in normal production. */
  testEventCode?: string;
  fetchImpl?: typeof fetch;
};

/** Sends events. Returns whether Meta accepted them; never throws (ads must not break a webhook). */
export async function sendCapi(opts: CapiOptions, events: Awaited<ReturnType<typeof capiEvent>>[]): Promise<boolean> {
  const send = opts.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${opts.pixelId}/events?access_token=${encodeURIComponent(opts.accessToken)}`;
  try {
    const res = await send(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: events, ...(opts.testEventCode ? { test_event_code: opts.testEventCode } : {}) }),
    });
    if (!res.ok) console.error("meta capi rejected", res.status, (await res.text()).slice(0, 300));
    return res.ok;
  } catch (err) {
    console.error("meta capi failed", err instanceof Error ? err.message : err);
    return false;
  }
}

// ---- Checkout-time browser context --------------------------------------------------------
// The webhook has no browser, but Meta needs the buyer's user agent for website events (and
// matches better with fbp/fbc/IP). Saved at checkout ONLY with marketing consent, deleted once
// sent, and dropped after 7 days at the latest (CAPI accepts events up to 7 days old).

export const TRACKING_RETENTION_DAYS = 7;

export type CheckoutContext = {
  fbp?: string | null;
  fbc?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  sourceUrl: string;
};

export async function saveCheckoutContext(db: Db, paymentId: string, ctx: CheckoutContext, now = new Date()) {
  await db
    .insert(paymentTracking)
    .values({
      paymentId,
      fbp: ctx.fbp ?? null,
      fbc: ctx.fbc ?? null,
      clientIp: ctx.clientIp ?? null,
      userAgent: ctx.userAgent?.slice(0, 500) ?? null,
      sourceUrl: ctx.sourceUrl,
      createdAt: now,
    })
    .onConflictDoNothing();
}

export async function takeCheckoutContext(db: Db, paymentId: string) {
  return (await db.select().from(paymentTracking).where(eq(paymentTracking.paymentId, paymentId)).get()) ?? null;
}

export async function dropCheckoutContext(db: Db, paymentId: string) {
  await db.delete(paymentTracking).where(eq(paymentTracking.paymentId, paymentId));
}

export async function purgeCheckoutContexts(db: Db, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - TRACKING_RETENTION_DAYS * 86_400_000);
  const rows = await db
    .delete(paymentTracking)
    .where(lt(paymentTracking.createdAt, cutoff))
    .returning({ id: paymentTracking.paymentId });
  return rows.length;
}
