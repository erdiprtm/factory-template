import { payments, webhookEvents } from "@factory/db";
import { and, eq, lt } from "drizzle-orm";
import { type Db, type Entitlement, grantFromPayment } from "../entitlements";
import type { PaymentProvider } from "./provider";

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
    origin: string;
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
  });
  try {
    const { redirectUrl, providerRef } = await provider.createCheckout({
      paymentId,
      amountIdr: input.plan.priceIdr,
      planId: input.plan.id,
      customer: { name: input.user.name || input.user.email, email: input.user.email },
      methods: input.methods,
      successUrl: `${input.origin}/billing/return?paymentId=${paymentId}`,
      failureUrl: `${input.origin}/billing/return?paymentId=${paymentId}`,
      callbackUrl: `${input.origin}/api/webhooks/${provider.name}`,
      expiresInMinutes: PENDING_MINUTES,
    });
    await db.update(payments).set({ providerRef }).where(eq(payments.id, paymentId));
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
  | { kind: "processed"; payment: Payment; entitlement: Entitlement | null };

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

  // Never trust the callback body alone: ask the provider.
  const confirmed = await provider.getStatus(payment.id);
  if (confirmed === "pending" && event.status === "paid") {
    // Status APIs can lag the notification (DOKU: up to ~60 s). Release the event key so the
    // provider's retry is processed again instead of being dropped as a duplicate.
    await db.delete(webhookEvents).where(eq(webhookEvents.id, eventRow.id));
    return { kind: "retry" };
  }
  if (confirmed === "pending") {
    await finish("still_pending");
    return { kind: "ignored", reason: "still pending at provider" };
  }

  const raw = JSON.stringify(event.raw);
  if (confirmed !== "paid") {
    await db.update(payments).set({ status: confirmed, rawPayload: raw }).where(eq(payments.id, payment.id));
    await finish(confirmed);
    const updated = { ...payment, status: confirmed, rawPayload: raw };
    return { kind: "processed", payment: updated, entitlement: null };
  }

  const plan = plans.find((p) => p.id === payment.planId);
  if (!plan) {
    await finish("unknown_plan");
    return { kind: "ignored", reason: `unknown plan ${payment.planId}` };
  }
  await db
    .update(payments)
    .set({ status: "paid", paidAt: now, providerRef: event.providerRef ?? payment.providerRef, rawPayload: raw })
    .where(and(eq(payments.id, payment.id), eq(payments.status, payment.status)));
  const entitlement = await grantFromPayment(
    db,
    { userId: payment.userId, paymentId: payment.id, planId: plan.id, months: plan.months },
    now,
  );
  await finish("processed");
  return { kind: "processed", payment: { ...payment, status: "paid", paidAt: now }, entitlement };
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
    .select({ status: payments.status, planId: payments.planId, amountIdr: payments.amountIdr })
    .from(payments)
    .where(and(eq(payments.id, paymentId), eq(payments.userId, userId)))
    .get();
  return row ?? null;
}
