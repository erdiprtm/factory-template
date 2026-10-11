import { entitlements, type schema } from "@factory/db";
import { and, desc, eq, gt } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { nextPeriod } from "./dates";

export { addDays, addMonths, nextPeriod } from "./dates";

// Accepts any async SQLite Drizzle database (D1 in the Worker, D1 in tests) without
// depending on Worker ambient types.
// biome-ignore lint/suspicious/noExplicitAny: the driver's run-result type varies by driver
export type Db = BaseSQLiteDatabase<"async", any, typeof schema>;
export type Entitlement = typeof entitlements.$inferSelect;

/** hasAccess(userId) = exists entitlement where expires_at > now. */
export async function hasAccess(db: Db, userId: string, now = new Date()): Promise<boolean> {
  const row = await db
    .select({ id: entitlements.id })
    .from(entitlements)
    .where(and(eq(entitlements.userId, userId), gt(entitlements.expiresAt, now)))
    .limit(1)
    .get();
  return row !== undefined;
}

async function latestExpiry(db: Db, userId: string): Promise<Date | null> {
  const row = await db
    .select({ expiresAt: entitlements.expiresAt })
    .from(entitlements)
    .where(eq(entitlements.userId, userId))
    .orderBy(desc(entitlements.expiresAt))
    .limit(1)
    .get();
  return row?.expiresAt ?? null;
}

async function insertEntitlement(db: Db, values: Omit<Entitlement, "id" | "createdAt">, now: Date) {
  const row = { id: crypto.randomUUID(), createdAt: now, ...values };
  await db.insert(entitlements).values(row);
  return row as Entitlement;
}

const isUniqueViolation = (err: unknown) =>
  /UNIQUE constraint failed/i.test(err instanceof Error ? `${err.message} ${String(err.cause ?? "")}` : String(err));

/**
 * Grants the free trial once per user. Returns null if the user already had one.
 * The partial unique index makes this safe under concurrent requests.
 */
export async function grantTrial(db: Db, userId: string, days: number, now = new Date()): Promise<Entitlement | null> {
  const existing = await db
    .select({ id: entitlements.id })
    .from(entitlements)
    .where(and(eq(entitlements.userId, userId), eq(entitlements.source, "trial")))
    .limit(1)
    .get();
  if (existing) return null;
  const period = nextPeriod(now, await latestExpiry(db, userId), { days });
  try {
    return await insertEntitlement(db, { userId, source: "trial", planId: null, paymentId: null, ...period }, now);
  } catch (err) {
    if (isUniqueViolation(err)) return null;
    throw err;
  }
}

/**
 * Grants access for a paid payment, extending from the latest expiry. Idempotent per payment:
 * a replayed webhook returns the existing entitlement instead of granting twice.
 */
export async function grantFromPayment(
  db: Db,
  input: { userId: string; paymentId: string; planId: string; months: number },
  now = new Date(),
): Promise<Entitlement> {
  const existing = await db.select().from(entitlements).where(eq(entitlements.paymentId, input.paymentId)).get();
  if (existing) return existing;
  const period = nextPeriod(now, await latestExpiry(db, input.userId), { months: input.months });
  try {
    return await insertEntitlement(
      db,
      { userId: input.userId, source: "payment", planId: input.planId, paymentId: input.paymentId, ...period },
      now,
    );
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const row = await db.select().from(entitlements).where(eq(entitlements.paymentId, input.paymentId)).get();
    if (!row) throw err;
    return row;
  }
}

/** Manual grant of N days from /admin (support, partners). Also extends, never overlaps. */
export async function grantAdminDays(db: Db, userId: string, days: number, now = new Date()): Promise<Entitlement> {
  const period = nextPeriod(now, await latestExpiry(db, userId), { days });
  return insertEntitlement(db, { userId, source: "admin_grant", planId: null, paymentId: null, ...period }, now);
}
