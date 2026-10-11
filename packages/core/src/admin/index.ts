import { entitlements, payments, user, webhookEvents } from "@factory/db";
import { and, count, desc, eq, gt } from "drizzle-orm";
import type { Db } from "../entitlements";

/** Admins = product.config.ts admin.emails ∪ the ADMIN_EMAILS var (comma-separated). Case-insensitive. */
export function isAdminEmail(email: string | null | undefined, configured: readonly string[], extra = ""): boolean {
  if (!email) return false;
  const all = [...configured, ...extra.split(",")].map((e) => e.trim().toLowerCase()).filter(Boolean);
  return all.includes(email.trim().toLowerCase());
}

/** YYYY-MM in Asia/Jakarta (UTC+7, no DST), so revenue lands in the local month it was paid. */
export function jakartaMonth(d: Date): string {
  const local = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function adminStats(db: Db, now = new Date()) {
  const users = (await db.select({ n: count() }).from(user).get())?.n ?? 0;

  // Active = users whose latest-ending entitlement is still running, classified by its source.
  const active = await db
    .select({ userId: entitlements.userId, source: entitlements.source, expiresAt: entitlements.expiresAt })
    .from(entitlements)
    .where(gt(entitlements.expiresAt, now));
  const latestByUser = new Map<string, { source: string; expiresAt: Date }>();
  for (const e of active) {
    const cur = latestByUser.get(e.userId);
    if (!cur || e.expiresAt > cur.expiresAt) latestByUser.set(e.userId, e);
  }
  const activeBySource = { trial: 0, paid: 0, admin_grant: 0, store: 0 };
  for (const { source } of latestByUser.values()) {
    if (source === "trial") activeBySource.trial++;
    else if (source === "payment") activeBySource.paid++;
    else if (source === "admin_grant") activeBySource.admin_grant++;
    else activeBySource.store++;
  }

  const paid = await db
    .select({ amountIdr: payments.amountIdr, paidAt: payments.paidAt })
    .from(payments)
    .where(eq(payments.status, "paid"));
  const months = new Map<string, { amountIdr: number; count: number }>();
  for (const p of paid) {
    if (!p.paidAt) continue;
    const m = jakartaMonth(p.paidAt);
    const cur = months.get(m) ?? { amountIdr: 0, count: 0 };
    months.set(m, { amountIdr: cur.amountIdr + p.amountIdr, count: cur.count + 1 });
  }
  const revenueByMonth = [...months.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, v]) => ({ month, ...v }));

  return { users, activeUsers: latestByUser.size, activeBySource, revenueByMonth };
}

export async function recentPayments(db: Db, limit = 20) {
  const rows = await db
    .select({
      id: payments.id,
      email: user.email,
      planId: payments.planId,
      amountIdr: payments.amountIdr,
      status: payments.status,
      provider: payments.provider,
      createdAt: payments.createdAt,
      paidAt: payments.paidAt,
    })
    .from(payments)
    .leftJoin(user, eq(user.id, payments.userId))
    .orderBy(desc(payments.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    ...r,
    email: r.email ?? "(akun dihapus)",
    createdAt: r.createdAt.toISOString(),
    paidAt: r.paidAt?.toISOString() ?? null,
  }));
}

export async function recentWebhookEvents(db: Db, limit = 50) {
  const rows = await db
    .select({
      id: webhookEvents.id,
      provider: webhookEvents.provider,
      eventKey: webhookEvents.eventKey,
      status: webhookEvents.status,
      receivedAt: webhookEvents.receivedAt,
      processedAt: webhookEvents.processedAt,
    })
    .from(webhookEvents)
    .orderBy(desc(webhookEvents.receivedAt))
    .limit(limit);
  return rows.map((r) => ({
    ...r,
    receivedAt: r.receivedAt.toISOString(),
    processedAt: r.processedAt?.toISOString() ?? null,
  }));
}

export async function findUserByEmail(db: Db, email: string) {
  return db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(and(eq(user.email, email.trim().toLowerCase())))
    .get();
}
