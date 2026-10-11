import { account, consents, entitlements, payments, remindersSent, session, user, verification } from "@factory/db";
import { desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../entitlements";

export type SubscriptionSummary = {
  active: boolean;
  /** Source of the entitlement that ends last. */
  source: "trial" | "payment" | "admin_grant" | "app_store" | "play_store" | null;
  /** When access ends (latest expiry), ISO string, or null if the user never had access. */
  expiresAt: string | null;
  trialUsed: boolean;
};

export async function subscriptionSummary(db: Db, userId: string, now = new Date()): Promise<SubscriptionSummary> {
  const rows = await db
    .select({ source: entitlements.source, expiresAt: entitlements.expiresAt })
    .from(entitlements)
    .where(eq(entitlements.userId, userId))
    .orderBy(desc(entitlements.expiresAt));
  const latest = rows[0];
  return {
    active: Boolean(latest && latest.expiresAt > now),
    source: latest?.source ?? null,
    expiresAt: latest ? latest.expiresAt.toISOString() : null,
    trialUsed: rows.some((r) => r.source === "trial"),
  };
}

/**
 * UU PDP right of access: everything stored about the user, as JSON. Secrets (session tokens,
 * OAuth tokens) are excluded; raw provider payloads are omitted.
 */
export async function exportUserData(db: Db, userId: string) {
  const profile = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.id, userId))
    .get();
  const linkedAccounts = await db
    .select({ provider: account.providerId, createdAt: account.createdAt })
    .from(account)
    .where(eq(account.userId, userId));
  const sessions = await db
    .select({ createdAt: session.createdAt, expiresAt: session.expiresAt, userAgent: session.userAgent })
    .from(session)
    .where(eq(session.userId, userId));
  const paymentRows = await db
    .select({
      id: payments.id,
      provider: payments.provider,
      planId: payments.planId,
      amountIdr: payments.amountIdr,
      status: payments.status,
      createdAt: payments.createdAt,
      paidAt: payments.paidAt,
    })
    .from(payments)
    .where(eq(payments.userId, userId));
  const entitlementRows = await db
    .select({
      source: entitlements.source,
      planId: entitlements.planId,
      startsAt: entitlements.startsAt,
      expiresAt: entitlements.expiresAt,
    })
    .from(entitlements)
    .where(eq(entitlements.userId, userId));
  const consentRows = await db
    .select({
      type: consents.type,
      version: consents.version,
      grantedAt: consents.grantedAt,
      revokedAt: consents.revokedAt,
    })
    .from(consents)
    .where(eq(consents.userId, userId));
  return {
    exportedAt: new Date().toISOString(),
    profile: profile ?? null,
    linkedAccounts,
    sessions,
    payments: paymentRows,
    entitlements: entitlementRows,
    consents: consentRows,
  };
}

/**
 * UU PDP right to erasure. Deletes the account, sessions, consents, entitlements and reminders.
 * Payment rows are kept for financial record-keeping obligations but de-identified: the user
 * link and raw provider payload are removed. Idempotent: safe to re-run if interrupted.
 */
export async function deleteUserData(db: Db, userId: string): Promise<void> {
  const email = (await db.select({ email: user.email }).from(user).where(eq(user.id, userId)).get())?.email;
  const entitlementIds = (
    await db.select({ id: entitlements.id }).from(entitlements).where(eq(entitlements.userId, userId))
  ).map((r) => r.id);

  if (entitlementIds.length > 0) {
    await db.delete(remindersSent).where(inArray(remindersSent.entitlementId, entitlementIds));
  }
  await db.delete(remindersSent).where(eq(remindersSent.userId, userId));
  await db.delete(entitlements).where(eq(entitlements.userId, userId));
  await db
    .update(payments)
    .set({ userId: `deleted:${crypto.randomUUID()}`, rawPayload: null })
    .where(eq(payments.userId, userId));
  await db.delete(consents).where(eq(consents.userId, userId));
  await db.delete(session).where(eq(session.userId, userId));
  await db.delete(account).where(eq(account.userId, userId));
  if (email) await db.delete(verification).where(eq(verification.identifier, email));
  await db.delete(user).where(eq(user.id, userId));
}
