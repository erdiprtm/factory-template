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
