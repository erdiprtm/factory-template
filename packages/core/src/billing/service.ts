import { paymentCharges, payments, webhookEvents } from "@factory/db";
import { and, eq, isNull, lt, lte, ne, or } from "drizzle-orm";
import { type Db, type Entitlement, grantFromPayment } from "../entitlements";
import type { PaymentProvider, ProviderStatus } from "./provider";

export type Plan = { id: string; label: string; months: number; priceIdr: number };
export type Payment = typeof payments.$inferSelect;

const PENDING_MINUTES = 60;

/**
 * Step 1 of the flow: create a pending payment row, then ask the provider for a hosted checkout.
 * The row exists before the provider call, so every attempt is recorded even if the call fails.
 */
export async function startCheckout(
  db: Db,
  provider: PaymentProvider,
  input: {
    user: { id: string; name: string; email: string };
    plan: Plan;
    methods: string[];
    /** The method picked in our own checkout (Pakasir, D-092); validated by the provider. */
    method?: string;
    origin: string;
    /** The buyer's first-touch ad attribution (@factory/core/attribution paymentAttribution). */
    attribution?: Partial<Pick<Payment, "utmSource" | "utmMedium" | "utmCampaign" | "utmContent" | "fbclid">>;
    now?: Date;
  },
): Promise<{ paymentId: string; redirectUrl: string }> {
  const now = input.now ?? new Date();
  const paymentId = `pay_${crypto.randomUUID().replaceAll("-", "")}`;
  await db.insert(payments).values({
    id: paymentId,
    userId: input.user.id,
    provider: provider.name,
    providerRef: null,
    planId: input.plan.id,
    amountIdr: input.plan.priceIdr,
    status: "pending",
    createdAt: now,
    expiresAt: new Date(now.getTime() + PENDING_MINUTES * 60_000),
    paidAt: null,
    rawPayload: null,
    ...input.attribution,
  });
  try {
    const { redirectUrl, providerRef, charge } = await provider.createCheckout({
      paymentId,
      amountIdr: input.plan.priceIdr,
      planId: input.plan.id,
      customer: { name: input.user.name || input.user.email, email: input.user.email },
      methods: input.methods,
      successUrl: `${input.origin}/billing/return?paymentId=${paymentId}`,
      failureUrl: `${input.origin}/billing/return?paymentId=${paymentId}`,
      callbackUrl: `${input.origin}/api/webhooks/${provider.name}`,
      expiresInMinutes: PENDING_MINUTES,
      method: input.method,
    });
    if (charge) {
      // Our own checkout screen (D-092). Never later than the provider's own expiry: past it the
      // QR or VA can't be paid. Our earlier expiry is enforced by cancelling at the provider.
      const ours = now.getTime() + PENDING_MINUTES * 60_000;
      const expiresAt = new Date(Math.min(ours, charge.providerExpiresAt.getTime()));
      await db.insert(paymentCharges).values({
        paymentId,
        method: charge.method,
        feeIdr: charge.feeIdr,
        totalIdr: charge.totalIdr,
        qrString: charge.qrString,
        vaNumber: charge.vaNumber,
        providerExpiresAt: charge.providerExpiresAt,
        isSandbox: charge.isSandbox,
        statusCheckedAt: null,
        createdAt: now,
      });
      await db.update(payments).set({ providerRef, expiresAt }).where(eq(payments.id, paymentId));
    } else {
      await db.update(payments).set({ providerRef }).where(eq(payments.id, paymentId));
    }
    return { paymentId, redirectUrl };
  } catch (err) {
    await db.update(payments).set({ status: "failed" }).where(eq(payments.id, paymentId));
    throw err;
  }
}

export type WebhookOutcome =
  | { kind: "unauthorized" }
  | { kind: "duplicate" }
  /** The webhook said paid but the provider doesn't confirm yet: answer non-2xx so it retries. */
  | { kind: "retry" }
  | { kind: "ignored"; reason: string }
  /** `entitlement` is set only for the one caller that moved the payment to paid (D-092). */
  | { kind: "processed"; payment: Payment; entitlement: Entitlement | null };

export type SettleOutcome = Extract<WebhookOutcome, { kind: "ignored" | "processed" }>;

/**
 * Step 3: verify → record the event once → confirm with the provider → update the payment →
 * grant access if paid. Safe to replay: duplicates stop at the webhook_events unique key, and a
 * payment can grant at most one entitlement.
 */
export async function handleWebhook(
  db: Db,
  provider: PaymentProvider,
  request: Request,
  plans: Plan[],
  now = new Date(),
): Promise<WebhookOutcome> {
  const event = await provider.verifyWebhook(request);
  if (!event) return { kind: "unauthorized" };

  const inserted = await db
    .insert(webhookEvents)
    .values({
      id: crypto.randomUUID(),
      provider: provider.name,
      eventKey: event.eventKey,
      receivedAt: now,
      processedAt: null,
      status: "received",
    })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  const eventRow = inserted[0];
  if (!eventRow) return { kind: "duplicate" };

  const finish = async (status: string) =>
    db.update(webhookEvents).set({ status, processedAt: new Date() }).where(eq(webhookEvents.id, eventRow.id));

  const payment = await db.select().from(payments).where(eq(payments.id, event.paymentId)).get();
  if (!payment || payment.provider !== provider.name) {
    await finish("unknown_payment");
    return { kind: "ignored", reason: "unknown payment" };
  }
  if (payment.status === "paid") {
    await finish("already_paid");
    return { kind: "ignored", reason: "already paid" };
  }

  // Never trust the callback body alone: ask the provider (throttled for Pakasir, D-092).
  const confirmed = await throttledStatus(db, provider, payment, now, { wait: true });
  if ((confirmed === "pending" || confirmed === null) && event.status === "paid") {
    // Status APIs can lag the notification (DOKU: up to ~60 s). Release the event key so the
    // provider's retry is processed again instead of being dropped as a duplicate.
    await db.delete(webhookEvents).where(eq(webhookEvents.id, eventRow.id));
    return { kind: "retry" };
  }
  if (confirmed === "pending" || confirmed === null) {
    await finish("still_pending");
    return { kind: "ignored", reason: "still pending at provider" };
  }

  const outcome = await settlePayment(db, payment, confirmed, {
    raw: JSON.stringify(event.raw),
    providerRef: event.providerRef,
    plans,
    now,
  });
  await finish(outcome.kind === "ignored" ? outcome.reason : confirmed === "paid" ? "processed" : confirmed);
  return outcome;
}

/**
 * Applies the provider's confirmed answer to a payment. Shared by the webhook, the status poll,
 * the cancel and the cron (D-092), and safe when they race: the entitlement is granted first (at
 * most one per payment, by its unique key), then the payment moves to paid only if it isn't
 * already. Only that one winner gets `entitlement`, so its caller sends the purchase events and
 * the receipt once. If the worker dies between the two steps, the next confirmation finds the
 * payment unpaid, gets the same entitlement back and finishes.
 */
export async function settlePayment(
  db: Db,
  payment: Payment,
  confirmed: Exclude<ProviderStatus, "pending">,
  opts: { raw: string; providerRef?: string | null; plans: Plan[]; now?: Date },
): Promise<SettleOutcome> {
  const now = opts.now ?? new Date();
  if (confirmed !== "paid") {
    const rows = await db
      .update(payments)
      .set({ status: confirmed, rawPayload: opts.raw })
      .where(and(eq(payments.id, payment.id), ne(payments.status, "paid")))
      .returning({ id: payments.id });
    if (rows.length === 0) return { kind: "ignored", reason: "already_paid" };
    return { kind: "processed", payment: { ...payment, status: confirmed, rawPayload: opts.raw }, entitlement: null };
  }
  const plan = opts.plans.find((p) => p.id === payment.planId);
  if (!plan) return { kind: "ignored", reason: `unknown_plan ${payment.planId}` };
  const entitlement = await grantFromPayment(
    db,
    { userId: payment.userId, paymentId: payment.id, planId: plan.id, months: plan.months },
    now,
  );
  const providerRef = opts.providerRef ?? payment.providerRef;
  const won = await db
    .update(payments)
    .set({ status: "paid", paidAt: now, providerRef, rawPayload: opts.raw })
    .where(and(eq(payments.id, payment.id), ne(payments.status, "paid")))
    .returning({ id: payments.id });
  if (won.length === 0) return { kind: "ignored", reason: "already_paid" };
  return {
    kind: "processed",
    payment: { ...payment, status: "paid", paidAt: now, providerRef, rawPayload: opts.raw },
    entitlement,
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Asks the provider for a payment's status. For providers with `statusIntervalMs` (Pakasir: once
 * per transaction every 4 s, D-092), at most once per interval per payment across every caller
 * and worker: the slot is claimed with one conditional UPDATE on payment_charges.status_checked_at.
 * Null = the slot was taken. With `wait` (the webhook, which must get an answer) it waits for the
 * next slot once.
 */
export async function throttledStatus(
  db: Db,
  provider: PaymentProvider,
  payment: Pick<Payment, "id" | "providerRef" | "amountIdr">,
  now = new Date(),
  opts: { wait?: boolean } = {},
): Promise<ProviderStatus | null> {
  const ref = { providerRef: payment.providerRef, amountIdr: payment.amountIdr };
  const interval = provider.statusIntervalMs;
  if (!interval) return provider.getStatus(payment.id, ref);
  const claim = async (at: Date) => {
    const rows = await db
      .update(paymentCharges)
      .set({ statusCheckedAt: at })
      .where(
        and(
          eq(paymentCharges.paymentId, payment.id),
          or(
            isNull(paymentCharges.statusCheckedAt),
            lte(paymentCharges.statusCheckedAt, new Date(at.getTime() - interval)),
          ),
        ),
      )
      .returning({ id: paymentCharges.paymentId });
    return rows.length > 0;
  };
  if (await claim(now)) return provider.getStatus(payment.id, ref);
  if (!opts.wait) return null;
  const row = await db
    .select({ at: paymentCharges.statusCheckedAt })
    .from(paymentCharges)
    .where(eq(paymentCharges.paymentId, payment.id))
    .get();
  // No charge row: nothing was created at the provider for this payment.
  if (!row) return "pending";
  const waitMs = Math.min(interval, Math.max(0, (row.at?.getTime() ?? 0) + interval - now.getTime()));
  await sleep(waitMs);
  return (await claim(new Date(now.getTime() + waitMs))) ? provider.getStatus(payment.id, ref) : null;
}

/**
 * The status poll's step, for providers with `statusIntervalMs` (D-092): ask the provider about
 * an unpaid payment, throttled, and settle it on a definite answer. Null when nothing changed
 * (other providers, throttled, still pending, not pending here, not the owner's).
 */
export async function confirmPayment(
  db: Db,
  provider: PaymentProvider,
  input: { userId?: string; paymentId: string; plans: Plan[]; now?: Date },
): Promise<SettleOutcome | null> {
  if (!provider.statusIntervalMs) return null;
  const payment = await db.select().from(payments).where(eq(payments.id, input.paymentId)).get();
  if (!payment || payment.provider !== provider.name || payment.status !== "pending") return null;
  if (input.userId !== undefined && payment.userId !== input.userId) return null;
  const confirmed = await throttledStatus(db, provider, payment, input.now);
  if (confirmed === null || confirmed === "pending") return null;
  return settlePayment(db, payment, confirmed, {
    raw: JSON.stringify({ source: "status_api", status: confirmed }),
    plans: input.plans,
    now: input.now,
  });
}

export type CancelOutcome =
  | { kind: "not_found" }
  | { kind: "not_pending"; status: Payment["status"] }
  /** The provider had a definite answer first (usually: it was just paid). */
  | { kind: "settled"; outcome: SettleOutcome }
  | { kind: "cancelled" }
  | { kind: "cancel_failed" };

/**
 * Cancels an unpaid payment at the provider (Pakasir, D-092): when the buyer picks another
 * method, when the countdown ends, or from the cron past our expiry. Asks the status first (when
 * the throttle allows), so a payment that just completed is granted instead. The row becomes
 * `expired` only after the provider confirmed the cancel; a payment that completes anyway is
 * still granted by its webhook (settlePayment accepts expired → paid).
 */
export async function cancelPayment(
  db: Db,
  provider: PaymentProvider,
  input: { userId?: string; paymentId: string; plans: Plan[]; now?: Date },
): Promise<CancelOutcome> {
  const payment = await db.select().from(payments).where(eq(payments.id, input.paymentId)).get();
  if (!payment || payment.provider !== provider.name) return { kind: "not_found" };
  if (input.userId !== undefined && payment.userId !== input.userId) return { kind: "not_found" };
  if (payment.status !== "pending") return { kind: "not_pending", status: payment.status };
  if (!provider.cancel) return { kind: "cancel_failed" };
  const confirmed = await throttledStatus(db, provider, payment, input.now);
  if (confirmed && confirmed !== "pending") {
    const raw = JSON.stringify({ source: "status_api", status: confirmed });
    const outcome = await settlePayment(db, payment, confirmed, { raw, plans: input.plans, now: input.now });
    return { kind: "settled", outcome };
  }
  const ok = await provider.cancel(payment.id, { providerRef: payment.providerRef, amountIdr: payment.amountIdr });
  if (!ok) return { kind: "cancel_failed" };
  await db
    .update(payments)
    .set({ status: "expired" })
    .where(and(eq(payments.id, payment.id), eq(payments.status, "pending")));
  return { kind: "cancelled" };
}

/** The checkout screen's details for the owner of a payment (D-092), or null. */
export async function paymentCharge(db: Db, userId: string, paymentId: string) {
  const row = await db
    .select({
      status: payments.status,
      planId: payments.planId,
      amountIdr: payments.amountIdr,
      expiresAt: payments.expiresAt,
      method: paymentCharges.method,
      feeIdr: paymentCharges.feeIdr,
      totalIdr: paymentCharges.totalIdr,
      qrString: paymentCharges.qrString,
      vaNumber: paymentCharges.vaNumber,
      isSandbox: paymentCharges.isSandbox,
    })
    .from(payments)
    .innerJoin(paymentCharges, eq(paymentCharges.paymentId, payments.id))
    .where(and(eq(payments.id, paymentId), eq(payments.userId, userId)))
    .get();
  return row ?? null;
}

/** A provider's pending payments past our expiry, for the cron to cancel there first (D-092). */
export async function overduePayments(db: Db, providerName: string, now = new Date(), limit = 20) {
  return db
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.provider, providerName), eq(payments.status, "pending"), lt(payments.expiresAt, now)))
    .limit(limit);
}

/** Step 5 (cron): pending payments past their expiry become expired. Returns how many. */
export async function expirePendingPayments(db: Db, now = new Date()): Promise<number> {
  const rows = await db
    .update(payments)
    .set({ status: "expired" })
    .where(and(eq(payments.status, "pending"), lt(payments.expiresAt, now)))
    .returning({ id: payments.id });
  return rows.length;
}

/** Step 4: the return page polls this. Only the owner may read a payment. */
export async function paymentStatus(db: Db, userId: string, paymentId: string) {
  const row = await db
    .select({
      status: payments.status,
      planId: payments.planId,
      amountIdr: payments.amountIdr,
      paidAt: payments.paidAt,
    })
    .from(payments)
    .where(and(eq(payments.id, paymentId), eq(payments.userId, userId)))
    .get();
  return row ?? null;
}
