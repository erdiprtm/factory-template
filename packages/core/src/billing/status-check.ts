import { entitlements, payments } from "@factory/db";
import { and, asc, desc, eq, gt, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { type Db, latestExpiry } from "../entitlements";
import type { PaymentProvider, ProviderStatus } from "./provider";
import { type Payment, type Plan, type SettleOutcome, settlePayment, throttledStatus } from "./service";

// D-128: a status check for a payment whose webhook may have been missed (Myna Fit, 2026-11-11:
// DOKU's QRIS notify URL was still DOKU's default, so a paid QRIS was never granted). One function
// for every caller: the return page, "Saya sudah bayar", the cron and /admin's "Cek ulang".

/** Who asks. The return page waits 60 s first; /admin skips the throttle and the provider rule. */
export type CheckSource = "return" | "manual" | "cron" | "admin";

/** DOKU: "hit Check status after 60 seconds after payment completion" (the return page = completion). */
export const FIRST_CHECK_DELAY_MS = 60_000;
/** The return page and the cron look at payments this young (pending, or expired by our cron). */
export const AUTO_WINDOW_MS = 2 * 60 * 60_000;
/** "Saya sudah bayar": the buyer may come back the next morning. */
export const MANUAL_WINDOW_MS = 24 * 60 * 60_000;
/** The cron leaves the first minutes to the webhook and the return page. */
export const CRON_MIN_AGE_MS = 5 * 60_000;

export type StatusCheck =
  | { kind: "not_found" }
  /** Already paid, too old, or the provider is never asked outside its webhook (Duitku). */
  | { kind: "not_checkable"; status: Payment["status"] }
  | { kind: "throttled"; status: Payment["status"]; retryAfterMs: number }
  /** The provider said nothing new. */
  | { kind: "unchanged"; status: Payment["status"] }
  /**
   * /admin only: the provider says paid, and a manual grant made after this payment already gives
   * access (probably the stand-in for it). Nothing was settled; the admin picks replace or stack.
   */
  | { kind: "needs_confirm"; currentExpiry: Date | null; adminGrantUntil: Date }
  /** `missedWebhook`: confirmed by asking, for a provider whose webhook should have said so. */
  | { kind: "settled"; outcome: SettleOutcome; missedWebhook: boolean };

/** What /admin chose for a payment covered by a manual grant (D-128). */
export type GrantMode = "replace" | "stack";

/**
 * Claims the payment's next status-check slot with one conditional UPDATE, so callers on every
 * worker share it. `arm` (the return page): a payment never checked gets its first slot
 * FIRST_CHECK_DELAY_MS from now instead of now. Returns the wait in ms, or 0 when claimed.
 */
async function claimSlot(db: Db, payment: Payment, intervalMs: number, now: Date, arm: boolean): Promise<number> {
  if (arm && payment.statusNextCheckAt === null) {
    await db
      .update(payments)
      .set({ statusNextCheckAt: new Date(now.getTime() + FIRST_CHECK_DELAY_MS) })
      .where(and(eq(payments.id, payment.id), isNull(payments.statusNextCheckAt)));
    return FIRST_CHECK_DELAY_MS;
  }
  const won = await db
    .update(payments)
    .set({ statusNextCheckAt: new Date(now.getTime() + intervalMs) })
    .where(
      and(eq(payments.id, payment.id), or(isNull(payments.statusNextCheckAt), lte(payments.statusNextCheckAt, now))),
    )
    .returning({ id: payments.id });
  if (won.length > 0) return 0;
  const row = await db
    .select({ at: payments.statusNextCheckAt })
    .from(payments)
    .where(eq(payments.id, payment.id))
    .get();
  return Math.max(1000, (row?.at?.getTime() ?? now.getTime()) - now.getTime());
}

/** Active manual grants made after the payment was started: likely the owner's stand-in for it. */
async function standInGrants(db: Db, payment: Payment, now: Date) {
  return db
    .select({ id: entitlements.id, expiresAt: entitlements.expiresAt })
    .from(entitlements)
    .where(
      and(
        eq(entitlements.userId, payment.userId),
        eq(entitlements.source, "admin_grant"),
        gt(entitlements.expiresAt, now),
        gte(entitlements.createdAt, payment.createdAt),
      ),
    )
    .orderBy(desc(entitlements.expiresAt));
}

/**
 * Asks the provider about one unpaid payment and settles a confirmed answer exactly like the
 * webhook (settlePayment: idempotent, expired → paid allowed). The caller then runs
 * afterPaymentSettled. Owner-only when `userId` is given.
 */
export async function checkPaymentStatus(
  db: Db,
  provider: PaymentProvider,
  input: {
    paymentId: string;
    userId?: string;
    source: CheckSource;
    plans: Plan[];
    now?: Date;
    /** /admin only, after needs_confirm. */
    grantMode?: GrantMode;
  },
): Promise<StatusCheck> {
  const now = input.now ?? new Date();
  const payment = await db.select().from(payments).where(eq(payments.id, input.paymentId)).get();
  if (!payment || payment.provider !== provider.name) return { kind: "not_found" };
  if (input.userId !== undefined && payment.userId !== input.userId) return { kind: "not_found" };
  if (payment.status === "paid") return { kind: "not_checkable", status: payment.status };

  const admin = input.source === "admin";
  const age = now.getTime() - payment.createdAt.getTime();
  if (!admin) {
    // Duitku blocks merchants that poll: only the webhook (and a one-off check from /admin).
    if (!provider.statusFallbackMs && !provider.statusIntervalMs)
      return { kind: "not_checkable", status: payment.status };
    if (payment.status !== "pending" && payment.status !== "expired")
      return { kind: "not_checkable", status: payment.status };
    const window = input.source === "manual" ? MANUAL_WINDOW_MS : AUTO_WINDOW_MS;
    if (age > window) return { kind: "not_checkable", status: payment.status };
    if (input.source === "cron" && age < CRON_MIN_AGE_MS) return { kind: "unchanged", status: payment.status };
  }

  let confirmed: ProviderStatus | null;
  if (provider.statusIntervalMs) {
    // Pakasir (D-092): its own throttle on payment_charges.
    confirmed = await throttledStatus(db, provider, payment, now);
    if (confirmed === null)
      return { kind: "throttled", status: payment.status, retryAfterMs: provider.statusIntervalMs };
  } else {
    if (!admin) {
      const wait = await claimSlot(db, payment, provider.statusFallbackMs ?? 0, now, input.source === "return");
      if (wait > 0) return { kind: "throttled", status: payment.status, retryAfterMs: wait };
    }
    confirmed = await provider.getStatus(payment.id, {
      providerRef: payment.providerRef,
      amountIdr: payment.amountIdr,
    });
  }

  if (confirmed === "pending") return { kind: "unchanged", status: payment.status };
  // Our cron already expired it: only a confirmed payment changes it again.
  if (confirmed !== "paid" && payment.status !== "pending") return { kind: "unchanged", status: payment.status };

  if (confirmed === "paid" && admin) {
    const grants = await standInGrants(db, payment, now);
    const first = grants[0];
    if (first && !input.grantMode)
      return {
        kind: "needs_confirm",
        currentExpiry: await latestExpiry(db, payment.userId),
        adminGrantUntil: first.expiresAt,
      };
    if (grants.length > 0 && input.grantMode === "replace") {
      // The paid plan takes the stand-in's place: those grants end now, the plan starts from the
      // user's remaining access (D-128). Older grants (partners, support) are left alone.
      await db
        .update(entitlements)
        .set({ expiresAt: now })
        .where(
          inArray(
            entitlements.id,
            grants.map((g) => g.id),
          ),
        );
    }
  }

  const outcome = await settlePayment(db, payment, confirmed, {
    raw: JSON.stringify({ source: "status_api", via: input.source, status: confirmed }),
    plans: input.plans,
    now,
  });
  return {
    kind: "settled",
    outcome,
    // Pakasir is polled by design; DOKU should have told us by webhook.
    missedWebhook: confirmed === "paid" && !provider.statusIntervalMs,
  };
}

/**
 * The cron's share (D-128): this provider's payments from the last AUTO_WINDOW_MS, at least
 * CRON_MIN_AGE_MS old, still pending or expired by us, whose slot is free. Oldest first.
 */
export async function statusCheckCandidates(db: Db, providerName: string, now = new Date(), limit = 20) {
  return db
    .select({ id: payments.id })
    .from(payments)
    .where(
      and(
        eq(payments.provider, providerName),
        inArray(payments.status, ["pending", "expired"]),
        gte(payments.createdAt, new Date(now.getTime() - AUTO_WINDOW_MS)),
        lte(payments.createdAt, new Date(now.getTime() - CRON_MIN_AGE_MS)),
        or(isNull(payments.statusNextCheckAt), lte(payments.statusNextCheckAt, now)),
      ),
    )
    .orderBy(asc(payments.createdAt))
    .limit(limit);
}

/** "Saya sudah bayar" without a payment id: the user's newest unpaid payments of the last day. */
export async function recentUnpaidPayments(db: Db, userId: string, providerName: string, now = new Date(), limit = 3) {
  return db
    .select({ id: payments.id })
    .from(payments)
    .where(
      and(
        eq(payments.userId, userId),
        eq(payments.provider, providerName),
        inArray(payments.status, ["pending", "expired"]),
        gte(payments.createdAt, new Date(now.getTime() - MANUAL_WINDOW_MS)),
      ),
    )
    .orderBy(desc(payments.createdAt))
    .limit(limit);
}

/** How many checkouts the user opened in the last `withinMs` (the repeat-checkout alert, D-128). */
export async function recentCheckoutCount(db: Db, userId: string, now = new Date(), withinMs = 10 * 60_000) {
  const rows = await db
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.userId, userId), gte(payments.createdAt, new Date(now.getTime() - withinMs))));
  return rows.length;
}
