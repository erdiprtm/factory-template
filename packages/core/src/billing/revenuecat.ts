// Store purchases through RevenueCat (Phase 10, D-120): iOS non-renewing IAP (and Play later).
// RevenueCat's webhook says "this user bought product X"; the server never grants on that alone:
// it asks RevenueCat's REST API for the customer and grants only if the purchase is there. The
// purchase becomes a `payments` row (provider "revenuecat", provider_ref = the store transaction)
// plus an entitlement with source app_store / play_store, extended the same way as a web payment,
// so /admin, refunds, the receipt and the purchase event all work unchanged.
// Docs read 2026-11-04: https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields
import { payments, webhookEvents } from "@factory/db";
import { and, eq } from "drizzle-orm";
import type { Db } from "../entitlements";
import { type Plan, type SettleOutcome, settlePayment } from "./service";

export const REVENUECAT = "revenuecat";
const API = "https://api.revenuecat.com/v1";

/** One webhook event's fields this module reads (the route validates the body's shape). */
export type RevenueCatEvent = {
  id: string;
  type: string;
  app_user_id?: string | null;
  original_app_user_id?: string | null;
  aliases?: string[] | null;
  product_id?: string | null;
  store?: string | null;
  environment?: "SANDBOX" | "PRODUCTION" | null;
  transaction_id?: string | null;
  purchased_at_ms?: number | null;
  price_in_purchased_currency?: number | null;
  currency?: string | null;
  cancel_reason?: string | null;
};

/** The entitlement source for a store RevenueCat names; null for stores this product doesn't sell in. */
export function storeSource(store: string | null | undefined): "app_store" | "play_store" | null {
  if (store === "APP_STORE") return "app_store";
  if (store === "PLAY_STORE") return "play_store";
  return null;
}

/** Our user ids are what the app passes to Purchases.logIn; RevenueCat's own anonymous ids aren't. */
export function candidateUserIds(e: RevenueCatEvent): string[] {
  const ids = [e.app_user_id, e.original_app_user_id, ...(e.aliases ?? [])];
  return [...new Set(ids.filter((id): id is string => !!id && !id.startsWith("$RCAnonymousID:")))];
}

/** Rupiah from the purchase price when the store charged in IDR; 0 otherwise (still granted). */
export const amountIdrOf = (e: RevenueCatEvent) =>
  e.currency === "IDR" && typeof e.price_in_purchased_currency === "number"
    ? Math.max(0, Math.round(e.price_in_purchased_currency))
    : 0;

type CustomerPurchase = { store_transaction_id?: string; purchase_date?: string; store?: string };

/**
 * Whether RevenueCat's customer record holds this purchase (the "ask the provider" step). Matched on
 * the store transaction id; without one, on the same store and a purchase time within 2 minutes.
 */
export function purchaseConfirmed(
  customer: { subscriber?: { non_subscriptions?: Record<string, CustomerPurchase[]> } },
  e: RevenueCatEvent,
): boolean {
  const items = customer.subscriber?.non_subscriptions?.[e.product_id ?? ""] ?? [];
  return items.some((p) => {
    if (p.store_transaction_id) return p.store_transaction_id === e.transaction_id;
    const at = p.purchase_date ? Date.parse(p.purchase_date) : Number.NaN;
    return (
      p.store?.toUpperCase() === e.store &&
      typeof e.purchased_at_ms === "number" &&
      Math.abs(at - e.purchased_at_ms) < 120_000
    );
  });
}

export async function fetchCustomer(
  apiKey: string,
  appUserId: string,
  doFetch: typeof fetch = fetch,
): Promise<unknown | null> {
  const res = await doFetch(`${API}/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!res?.ok) return null;
  return res.json().catch(() => null);
}

export type StoreOutcome =
  | { kind: "duplicate" }
  | { kind: "ignored"; reason: string }
  | { kind: "retry"; reason: string }
  | { kind: "granted"; outcome: SettleOutcome }
  | { kind: "refund"; paymentId: string };

/**
 * One verified webhook event (the Authorization header was checked by the route). Idempotent per
 * RevenueCat event id (webhook_events) and per store transaction (payments' unique provider ref).
 */
export async function handleRevenueCatEvent(
  db: Db,
  e: RevenueCatEvent,
  opts: {
    plans: Plan[];
    /** Store product id → plan id (product.config.ts native.iap). */
    products: Readonly<Record<string, string>>;
    userExists: (id: string) => Promise<boolean>;
    customer: (appUserId: string) => Promise<unknown | null>;
    now?: Date;
  },
): Promise<StoreOutcome> {
  const now = opts.now ?? new Date();
  const inserted = await db
    .insert(webhookEvents)
    .values({ id: crypto.randomUUID(), provider: REVENUECAT, eventKey: e.id, receivedAt: now, status: "received" })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  const row = inserted[0];
  if (!row) return { kind: "duplicate" };
  const finish = async (status: string) =>
    db.update(webhookEvents).set({ status, processedAt: new Date() }).where(eq(webhookEvents.id, row.id));
  const release = () => db.delete(webhookEvents).where(eq(webhookEvents.id, row.id));

  // A refund through the store's support (CANCELLATION + CUSTOMER_SUPPORT): the route marks it refunded.
  if (e.type === "CANCELLATION" && e.cancel_reason === "CUSTOMER_SUPPORT" && e.transaction_id) {
    const p = await db
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.provider, REVENUECAT), eq(payments.providerRef, e.transaction_id)))
      .get();
    await finish(p ? "refund" : "unknown_payment");
    return p ? { kind: "refund", paymentId: p.id } : { kind: "ignored", reason: "unknown payment" };
  }
  if (e.type !== "NON_RENEWING_PURCHASE" && e.type !== "INITIAL_PURCHASE") {
    await finish(`ignored_${e.type.toLowerCase()}`);
    return { kind: "ignored", reason: e.type };
  }

  const source = storeSource(e.store);
  const planId = e.product_id ? opts.products[e.product_id] : undefined;
  const plan = opts.plans.find((p) => p.id === planId);
  if (!source || !plan || !e.transaction_id) {
    await finish("unknown_product");
    return { kind: "ignored", reason: `product ${e.product_id ?? "-"} on ${e.store ?? "-"}` };
  }
  let userId: string | null = null;
  for (const id of candidateUserIds(e)) if (await opts.userExists(id)) userId = id;
  if (!userId) {
    await finish("unknown_user");
    return { kind: "ignored", reason: "no account for this purchase" };
  }
  // Never grant on the webhook alone: RevenueCat's own record must hold the purchase.
  const customer = await opts.customer(userId);
  if (!customer) {
    await release(); // RevenueCat retries; a later delivery is processed again
    return { kind: "retry", reason: "customer lookup failed" };
  }
  if (!purchaseConfirmed(customer as Parameters<typeof purchaseConfirmed>[0], e)) {
    await finish("not_confirmed");
    return { kind: "ignored", reason: "purchase not in RevenueCat's record" };
  }

  const paymentId = crypto.randomUUID();
  const created = await db
    .insert(payments)
    .values({
      id: paymentId,
      userId,
      provider: REVENUECAT,
      providerRef: e.transaction_id,
      planId: plan.id,
      amountIdr: amountIdrOf(e),
      status: "pending",
      createdAt: now,
      expiresAt: now,
    })
    .onConflictDoNothing()
    .returning();
  const payment = created[0];
  if (!payment) {
    await finish("already_paid");
    return { kind: "duplicate" };
  }
  const outcome = await settlePayment(db, payment, "paid", {
    raw: JSON.stringify({ event: e.id, store: e.store, environment: e.environment, product: e.product_id }),
    plans: opts.plans,
    source,
    now,
  });
  await finish("processed");
  return { kind: "granted", outcome };
}
