// /admin unit economics from D1 (D-038): ad spend in, buyers and revenue out.
import { adSpend, attributions, entitlements, funnelEvents, payments, user } from "@factory/db";
import { and, desc, eq, gt, gte, inArray, lt, lte } from "drizzle-orm";
import { recordServerEvent } from "../attribution";
import type { Db } from "../entitlements";
import { type Acquisition, computeEconomics, computeFunnel, type PaidPayment, type SpendEntry } from "./metrics";

export * from "./csv";
export * from "./metrics";

/**
 * Where spend comes from. Manual entry and the Ads Manager CSV exist today; a Meta Marketing API
 * sync would implement this (fetch daily spend per campaign for a range) and call upsertSpend
 * with source "api". Not built yet on purpose: it needs Meta app review and a long-lived token.
 */
export interface AdSpendSource {
  readonly channel: string;
  fetchDaily(range: { from: string; to: string }): Promise<SpendEntry[]>;
}

export async function syncSpend(db: Db, source: AdSpendSource, range: { from: string; to: string }) {
  return upsertSpend(db, await source.fetchDaily(range), "api");
}

/** Inserts or replaces (same day + channel + campaign) spend rows. */
export async function upsertSpend(db: Db, rows: SpendEntry[], source: "manual" | "csv" | "api", now = new Date()) {
  for (const r of rows) {
    await db
      .insert(adSpend)
      .values({
        id: crypto.randomUUID(),
        day: r.date,
        channel: r.channel,
        campaign: r.campaign,
        amountIdr: r.amountIdr,
        source,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [adSpend.day, adSpend.channel, adSpend.campaign],
        set: { amountIdr: r.amountIdr, source, updatedAt: now },
      });
  }
  return rows.length;
}

export async function deleteSpend(db: Db, id: string): Promise<boolean> {
  return (await db.delete(adSpend).where(eq(adSpend.id, id)).returning({ id: adSpend.id })).length > 0;
}

export async function recentSpend(db: Db, limit = 60) {
  return db.select().from(adSpend).orderBy(desc(adSpend.day), adSpend.campaign).limit(limit);
}

const JAKARTA_MS = 7 * 3_600_000;
/** Start of a Jakarta calendar day (YYYY-MM-DD) as a UTC instant. */
export const jakartaDayStart = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - JAKARTA_MS);
export const jakartaDay = (d: Date) => new Date(d.getTime() + JAKARTA_MS).toISOString().slice(0, 10);

export type EconomicsOptions = {
  from: string;
  to: string;
  campaign?: string;
  plans: readonly { id: string; months: number }[];
  steps: readonly string[];
  benchmarks: Partial<Record<string, number>>;
  now?: Date;
};

/**
 * Everything /admin's unit-economics view shows for a date range (Jakarta days, inclusive):
 * totals and per-campaign CAC, ROAS d7/d30, AOV, renewal rate, LTV, plus the funnel.
 * Cohort = users first seen in the range (attribution's first visit, else signup).
 */
export async function loadEconomics(db: Db, o: EconomicsOptions) {
  const start = jakartaDayStart(o.from);
  const end = new Date(jakartaDayStart(o.to).getTime() + 86_400_000);
  const spendRows = await db
    .select({ date: adSpend.day, channel: adSpend.channel, campaign: adSpend.campaign, amountIdr: adSpend.amountIdr })
    .from(adSpend)
    .where(and(gte(adSpend.day, o.from), lte(adSpend.day, o.to)));

  const users = await db
    .select({
      userId: user.id,
      createdAt: user.createdAt,
      campaign: attributions.utmCampaign,
      firstSeenAt: attributions.firstSeenAt,
    })
    .from(user)
    .leftJoin(attributions, eq(attributions.userId, user.id));
  const acquisitions: Acquisition[] = users
    .map((u) => ({ userId: u.userId, campaign: u.campaign ?? null, firstSeenAt: u.firstSeenAt ?? u.createdAt }))
    .filter((a) => a.firstSeenAt >= start && a.firstSeenAt < end);

  const ids = acquisitions.map((a) => a.userId);
  const months = new Map(o.plans.map((p) => [p.id, p.months]));
  const paid: PaidPayment[] = [];
  for (let i = 0; i < ids.length; i += 90) {
    const rows = await db
      .select({
        userId: payments.userId,
        amountIdr: payments.amountIdr,
        paidAt: payments.paidAt,
        planId: payments.planId,
      })
      .from(payments)
      .where(and(eq(payments.status, "paid"), inArray(payments.userId, ids.slice(i, i + 90))));
    for (const r of rows)
      if (r.paidAt)
        paid.push({ userId: r.userId, amountIdr: r.amountIdr, paidAt: r.paidAt, months: months.get(r.planId) ?? 12 });
  }

  const economics = computeEconomics({
    spend: o.campaign ? spendRows.filter((s) => s.campaign === o.campaign) : spendRows,
    acquisitions: o.campaign ? acquisitions.filter((a) => a.campaign === o.campaign) : acquisitions,
    payments: paid,
    now: o.now,
  });

  const events = await db
    .select({ event: funnelEvents.event, anonId: funnelEvents.anonId, userId: funnelEvents.userId })
    .from(funnelEvents)
    .where(
      and(
        gte(funnelEvents.createdAt, start),
        lt(funnelEvents.createdAt, end),
        o.campaign ? eq(funnelEvents.utmCampaign, o.campaign) : undefined,
      ),
    );
  const funnel = computeFunnel(
    events.map((e) => ({ event: e.event, visitor: e.anonId ?? e.userId ?? "" })).filter((e) => e.visitor),
    o.steps,
    o.benchmarks,
  );
  return { range: { from: o.from, to: o.to, campaign: o.campaign ?? null }, ...economics, funnel };
}

/**
 * Admin: a payment was refunded at the provider (done by the human in its dashboard). Marks it
 * refunded, ends the access it granted now, and records the refund event. Idempotent.
 */
export async function markRefunded(db: Db, paymentId: string, now = new Date()) {
  const p = await db.select().from(payments).where(eq(payments.id, paymentId)).get();
  if (!p) return { kind: "not_found" as const };
  if (p.status === "refunded") return { kind: "already" as const, payment: p };
  if (p.status !== "paid") return { kind: "not_paid" as const };
  await db.update(payments).set({ status: "refunded" }).where(eq(payments.id, paymentId));
  await db
    .update(entitlements)
    .set({ expiresAt: now })
    .where(and(eq(entitlements.paymentId, paymentId), gt(entitlements.expiresAt, now)));
  await recordServerEvent(
    db,
    { event: "refund", userId: p.userId, valueIdr: p.amountIdr, utmCampaign: p.utmCampaign, utmSource: p.utmSource },
    now,
  );
  return { kind: "refunded" as const, payment: { ...p, status: "refunded" as const } };
}
