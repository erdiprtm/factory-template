// First-touch ad attribution and first-party funnel events (sell engine, D-033).
//
// A device gets a random anonId and a "touch" on its first visit: UTM tags, fbclid, landing
// path, time. The touch travels site → app in the CTA link's query string (different origins),
// is attached to the user at signup, and is copied onto every payment at checkout. Funnel events
// are stored first-party (no consent needed: random ids, no personal data) so /admin can show the
// funnel and per-campaign CAC/ROAS without asking a third party.
import { attributions, funnelEvents, payments } from "@factory/db";
import { and, eq, lt, ne, or } from "drizzle-orm";
import type { ClientFunnelEvent, FunnelEvent } from "../analytics";
import type { Db } from "../entitlements";
import type { Attribution, Touch } from "./touch";

export * from "./touch";

/** Attaches a touch to a user (at signup). First touch wins: an existing row is never changed. */
export async function saveAttribution(db: Db, userId: string, touch: Touch, now = new Date()): Promise<boolean> {
  const rows = await db
    .insert(attributions)
    .values({
      id: crypto.randomUUID(),
      userId,
      anonId: touch.anonId,
      utmSource: touch.utm_source ?? null,
      utmMedium: touch.utm_medium ?? null,
      utmCampaign: touch.utm_campaign ?? null,
      utmContent: touch.utm_content ?? null,
      fbclid: touch.fbclid ?? null,
      landingPath: touch.landingPath ?? null,
      firstSeenAt: new Date(Math.min(touch.firstSeenAt, now.getTime())),
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: attributions.id });
  return rows.length > 0;
}

export type UserAttribution = typeof attributions.$inferSelect;

export async function attributionFor(db: Db, userId: string): Promise<UserAttribution | null> {
  return (await db.select().from(attributions).where(eq(attributions.userId, userId)).get()) ?? null;
}

/** The payment columns that snapshot the buyer's attribution at checkout. */
export function paymentAttribution(a: UserAttribution | null) {
  return {
    utmSource: a?.utmSource ?? null,
    utmMedium: a?.utmMedium ?? null,
    utmCampaign: a?.utmCampaign ?? null,
    utmContent: a?.utmContent ?? null,
    fbclid: a?.fbclid ?? null,
  };
}

/** Browser funnel events (POST /api/events), keyed by the device's anonId. */
export async function recordClientEvents(
  db: Db,
  input: {
    anonId: string;
    attribution: Pick<Attribution, "utm_source" | "utm_campaign">;
    events: { event: ClientFunnelEvent; step?: number }[];
  },
  now = new Date(),
): Promise<void> {
  if (input.events.length === 0) return;
  await db.insert(funnelEvents).values(
    input.events.map((e) => ({
      id: crypto.randomUUID(),
      event: e.event,
      anonId: input.anonId,
      userId: null,
      step: e.step ?? null,
      utmSource: input.attribution.utm_source ?? null,
      utmCampaign: input.attribution.utm_campaign ?? null,
      valueIdr: null,
      createdAt: now,
    })),
  );
}

/** Server funnel events (purchase, renewal, refund) for a user, joined to their device's anonId. */
export async function recordServerEvent(
  db: Db,
  input: {
    event: Extract<FunnelEvent, "purchase" | "renewal" | "refund">;
    userId: string;
    valueIdr: number;
    utmCampaign: string | null;
    utmSource: string | null;
  },
  now = new Date(),
): Promise<void> {
  const a = await attributionFor(db, input.userId);
  await db.insert(funnelEvents).values({
    id: crypto.randomUUID(),
    event: input.event,
    anonId: a?.anonId ?? null,
    userId: input.userId,
    step: null,
    utmSource: input.utmSource,
    utmCampaign: input.utmCampaign,
    valueIdr: input.valueIdr,
    createdAt: now,
  });
}

/** A confirmed payment is the user's "purchase" if it's their first paid one, otherwise a "renewal". */
export async function paidEventKind(db: Db, payment: { id: string; userId: string }): Promise<"purchase" | "renewal"> {
  const earlier = await db
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.userId, payment.userId), eq(payments.status, "paid"), ne(payments.id, payment.id)))
    .limit(1);
  return earlier.length > 0 ? "renewal" : "purchase";
}

/** UU PDP: the user's attribution and funnel events (export), and their removal (erasure). */
export async function exportAttribution(db: Db, userId: string) {
  const a = await attributionFor(db, userId);
  const events = await db
    .select({ event: funnelEvents.event, step: funnelEvents.step, createdAt: funnelEvents.createdAt })
    .from(funnelEvents)
    .where(
      a?.anonId
        ? or(eq(funnelEvents.userId, userId), eq(funnelEvents.anonId, a.anonId))
        : eq(funnelEvents.userId, userId),
    );
  return { attribution: a, funnelEvents: events };
}

export async function deleteAttribution(db: Db, userId: string): Promise<void> {
  const a = await attributionFor(db, userId);
  if (a?.anonId) await db.delete(funnelEvents).where(eq(funnelEvents.anonId, a.anonId));
  await db.delete(funnelEvents).where(eq(funnelEvents.userId, userId));
  await db.delete(attributions).where(eq(attributions.userId, userId));
}

/** Funnel events are kept 400 days (a year of comparisons). Payments hold the revenue history. */
export const FUNNEL_RETENTION_DAYS = 400;

export async function purgeFunnelEvents(db: Db, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - FUNNEL_RETENTION_DAYS * 86_400_000);
  const rows = await db
    .delete(funnelEvents)
    .where(lt(funnelEvents.createdAt, cutoff))
    .returning({ id: funnelEvents.id });
  return rows.length;
}
