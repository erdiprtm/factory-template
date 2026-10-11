import { entitlements, remindersSent, user } from "@factory/db";
import { and, eq, gt, lte } from "drizzle-orm";
import type { Db } from "../entitlements";

export type ReminderKind = "d7" | "d1" | "expired";
export type DueReminder = { kind: ReminderKind; userId: string; email: string; entitlementId: string; expiresAt: Date };

const DAY = 24 * 60 * 60 * 1000;

/**
 * Reminders due now: 7 days and 1 day before the user's latest access ends, and once after it
 * ended (within 3 days, so a late cron still catches it). Only the latest entitlement per user
 * counts: if they already renewed, nothing is due. reminders_sent makes each kind send once.
 */
export async function dueReminders(db: Db, now = new Date()): Promise<DueReminder[]> {
  const windowStart = new Date(now.getTime() - 3 * DAY);
  const windowEnd = new Date(now.getTime() + 7 * DAY);
  const candidates = await db
    .select({ id: entitlements.id, userId: entitlements.userId, expiresAt: entitlements.expiresAt, email: user.email })
    .from(entitlements)
    .innerJoin(user, eq(user.id, entitlements.userId))
    .where(and(gt(entitlements.expiresAt, windowStart), lte(entitlements.expiresAt, windowEnd)));

  const due: DueReminder[] = [];
  for (const c of candidates) {
    const later = await db
      .select({ id: entitlements.id })
      .from(entitlements)
      .where(and(eq(entitlements.userId, c.userId), gt(entitlements.expiresAt, c.expiresAt)))
      .limit(1)
      .get();
    if (later) continue;
    const left = c.expiresAt.getTime() - now.getTime();
    const kind: ReminderKind | null = left <= 0 ? "expired" : left <= DAY ? "d1" : left <= 7 * DAY ? "d7" : null;
    if (!kind) continue;
    const sent = await db
      .select({ id: remindersSent.id })
      .from(remindersSent)
      .where(and(eq(remindersSent.entitlementId, c.id), eq(remindersSent.kind, kind)))
      .get();
    if (!sent) due.push({ kind, userId: c.userId, email: c.email, entitlementId: c.id, expiresAt: c.expiresAt });
  }
  return due;
}

/** Records a reminder as sent. Returns false if another run already recorded it (unique key). */
export async function markReminderSent(db: Db, r: DueReminder, now = new Date()): Promise<boolean> {
  const rows = await db
    .insert(remindersSent)
    .values({ id: crypto.randomUUID(), userId: r.userId, entitlementId: r.entitlementId, kind: r.kind, sentAt: now })
    .onConflictDoNothing()
    .returning({ id: remindersSent.id });
  return rows.length > 0;
}
