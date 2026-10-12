// Free quota of the product's core action (sell engine Module 5, D-037): N free uses per user,
// enforced on the server, so the first real result comes before the paywall.
import { freeUsage } from "@factory/db";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../entitlements";

/**
 * Uses one free use if any are left. Atomic: the increment only happens while used < limit, so
 * concurrent requests can't exceed the quota.
 */
export async function consumeFreeUse(
  db: Db,
  input: { userId: string; action: string; limit: number },
  now = new Date(),
): Promise<{ allowed: boolean; used: number; left: number }> {
  if (input.limit <= 0) return { allowed: false, used: 0, left: 0 };
  const rows = await db
    .insert(freeUsage)
    .values({ id: crypto.randomUUID(), userId: input.userId, action: input.action, used: 1, updatedAt: now })
    .onConflictDoUpdate({
      target: [freeUsage.userId, freeUsage.action],
      set: { used: sql`${freeUsage.used} + 1`, updatedAt: now },
      setWhere: sql`${freeUsage.used} < ${input.limit}`,
    })
    .returning({ used: freeUsage.used });
  const row = rows[0];
  if (!row) {
    return { allowed: false, used: input.limit, left: 0 };
  }
  return { allowed: true, used: row.used, left: Math.max(0, input.limit - row.used) };
}

export async function freeUsesUsed(db: Db, userId: string, action: string): Promise<number> {
  const row = await db
    .select({ used: freeUsage.used })
    .from(freeUsage)
    .where(and(eq(freeUsage.userId, userId), eq(freeUsage.action, action)))
    .get();
  return row?.used ?? 0;
}

export async function deleteFreeUsage(db: Db, userId: string): Promise<void> {
  await db.delete(freeUsage).where(eq(freeUsage.userId, userId));
}

// ---- Anonymous free uses (D-042) ------------------------------------------------------------
// "Pay for proof": a visitor gets the first real result before signing up. Server-enforced per
// device (the random anonId from attribution, D-033) AND per IP per Jakarta day, so private
// windows and new devices can't farm free uses. Rows reuse free_usage with prefixed keys:
//   anon:<anonId>                       action
//   ip:<sha256(ip + secret), 32 hex>    action@YYYY-MM-DD
// No raw IP is stored. When the visitor signs up, the device's uses move to the account.

export const anonKey = (anonId: string) => `anon:${anonId}`;

export async function ipKey(ip: string, secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${ip}|${secret}`));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `ip:${hex.slice(0, 32)}`;
}

const jakartaDay = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

/**
 * Spends one anonymous free use: the device must have one left AND its IP must be under the daily
 * cap. If the IP cap refuses, the device's use is given back, so the count stays exact.
 */
export async function consumeAnonymousFreeUse(
  db: Db,
  input: { anonId: string; ipKey: string; action: string; limit: number; perIpPerDay: number },
  now = new Date(),
): Promise<{ allowed: boolean; left: number }> {
  const device = await consumeFreeUse(
    db,
    { userId: anonKey(input.anonId), action: input.action, limit: input.limit },
    now,
  );
  if (!device.allowed) return { allowed: false, left: 0 };
  const ip = await consumeFreeUse(
    db,
    { userId: input.ipKey, action: `${input.action}@${jakartaDay(now)}`, limit: input.perIpPerDay },
    now,
  );
  if (!ip.allowed) {
    await db
      .update(freeUsage)
      .set({ used: sql`${freeUsage.used} - 1`, updatedAt: now })
      .where(and(eq(freeUsage.userId, anonKey(input.anonId)), eq(freeUsage.action, input.action)));
    return { allowed: false, left: 0 };
  }
  return { allowed: true, left: device.left };
}

/**
 * At signup: the device's anonymous uses count against the new account (capped at the account's
 * limit), then the device row is removed. Free uses can't be doubled by signing up.
 */
export async function claimAnonymousUses(
  db: Db,
  input: { userId: string; anonId: string; action: string; limit: number },
  now = new Date(),
): Promise<number> {
  const used = await freeUsesUsed(db, anonKey(input.anonId), input.action);
  if (used === 0) return 0;
  const current = await freeUsesUsed(db, input.userId, input.action);
  const next = Math.min(input.limit, current + used);
  await db
    .insert(freeUsage)
    .values({ id: crypto.randomUUID(), userId: input.userId, action: input.action, used: next, updatedAt: now })
    .onConflictDoUpdate({ target: [freeUsage.userId, freeUsage.action], set: { used: next, updatedAt: now } });
  await db
    .delete(freeUsage)
    .where(and(eq(freeUsage.userId, anonKey(input.anonId)), eq(freeUsage.action, input.action)));
  return used;
}

/** Daily IP rows are only needed for their day; the cron drops older ones. */
export async function purgeIpUsage(db: Db, now = new Date()): Promise<void> {
  await db
    .delete(freeUsage)
    .where(and(sql`${freeUsage.userId} like 'ip:%'`, sql`${freeUsage.updatedAt} < ${now.getTime() - 2 * 86_400_000}`));
}
