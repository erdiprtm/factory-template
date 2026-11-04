import { env } from "cloudflare:workers";
import {
  amountIdrOf,
  candidateUserIds,
  handleRevenueCatEvent,
  purchaseConfirmed,
  type RevenueCatEvent,
  storeSource,
} from "@factory/core/billing/revenuecat";
import { schema } from "@factory/db";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { call, firstPlan, get, signInWithConsent } from "./helpers";

// D-120: RevenueCat purchases become payments + store entitlements, only once RevenueCat's own
// record holds them; replays and refunds behave like web payments. Real D1.
const db = drizzle(env.DB, { schema });
const products = { test_product_3m: firstPlan.id };

function purchase(userId: string, over: Partial<RevenueCatEvent> = {}): RevenueCatEvent {
  return {
    id: crypto.randomUUID(),
    type: "NON_RENEWING_PURCHASE",
    app_user_id: userId,
    aliases: [userId],
    product_id: "test_product_3m",
    store: "APP_STORE",
    environment: "SANDBOX",
    transaction_id: `tx-${crypto.randomUUID()}`,
    purchased_at_ms: Date.now(),
    price_in_purchased_currency: 149000,
    currency: "IDR",
    ...over,
  };
}
const holding = (e: RevenueCatEvent) => ({
  subscriber: { non_subscriptions: { [e.product_id as string]: [{ store_transaction_id: e.transaction_id ?? "" }] } },
});
const userExists = async (id: string) =>
  !!(await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, id)).get());

async function newUser() {
  const cookie = await signInWithConsent(`rc-${crypto.randomUUID()}@example.com`);
  const me = await (await get("/api/me", cookie)).json<{ user: { id: string } }>();
  return { cookie, id: me.user.id };
}

describe("RevenueCat purchases", () => {
  it("confirmed purchase: a revenuecat payment and an app_store entitlement for the plan's months; replays don't regrant", async () => {
    const user = await newUser();
    const e = purchase(user.id);
    const opts = { plans: [firstPlan], products, userExists, customer: async () => holding(e) };
    const r = await handleRevenueCatEvent(db, e, opts);
    expect(r.kind).toBe("granted");
    const pays = await db.select().from(schema.payments).where(eq(schema.payments.userId, user.id));
    expect(pays).toMatchObject([
      {
        provider: "revenuecat",
        providerRef: e.transaction_id,
        status: "paid",
        amountIdr: 149000,
        planId: firstPlan.id,
      },
    ]);
    const ents = await db.select().from(schema.entitlements).where(eq(schema.entitlements.userId, user.id));
    expect(ents.map((x) => x.source)).toEqual(["app_store"]);

    expect((await handleRevenueCatEvent(db, e, opts)).kind).toBe("duplicate"); // same event id
    expect((await handleRevenueCatEvent(db, { ...e, id: crypto.randomUUID() }, opts)).kind).toBe("duplicate"); // same transaction
    expect(await db.select().from(schema.entitlements).where(eq(schema.entitlements.userId, user.id))).toHaveLength(1);

    // A store refund (customer support) ends the access, as /admin's refund does.
    const refund = await handleRevenueCatEvent(
      db,
      { ...e, id: crypto.randomUUID(), type: "CANCELLATION", cancel_reason: "CUSTOMER_SUPPORT" },
      opts,
    );
    expect(refund).toMatchObject({ kind: "refund", paymentId: pays[0]?.id });
  });

  it("never on the webhook alone: not in RevenueCat's record → nothing; lookup down → retry", async () => {
    const user = await newUser();
    const e = purchase(user.id);
    const base = { plans: [firstPlan], products, userExists };
    const missing = await handleRevenueCatEvent(db, e, { ...base, customer: async () => ({ subscriber: {} }) });
    expect(missing).toMatchObject({ kind: "ignored" });
    const e2 = purchase(user.id);
    expect((await handleRevenueCatEvent(db, e2, { ...base, customer: async () => null })).kind).toBe("retry");
    // The event key was released: RevenueCat's retry is processed.
    expect((await handleRevenueCatEvent(db, e2, { ...base, customer: async () => holding(e2) })).kind).toBe("granted");
    expect(
      (await db.select().from(schema.payments).where(eq(schema.payments.userId, user.id))).map((p) => p.providerRef),
    ).toEqual([e2.transaction_id]);
  });

  it("unknown product, store or account: ignored", async () => {
    const user = await newUser();
    const opts = { plans: [firstPlan], products, userExists, customer: async () => null };
    for (const e of [
      purchase(user.id, { product_id: "other" }),
      purchase(user.id, { store: "STRIPE" }),
      purchase("$RCAnonymousID:abc", { aliases: ["$RCAnonymousID:abc"] }),
      purchase(user.id, { type: "EXPIRATION" }),
    ])
      expect((await handleRevenueCatEvent(db, e, opts)).kind).toBe("ignored");
  });

  it("the route is off until both secrets exist", async () => {
    const res = await call("/api/webhooks-store/revenuecat", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "x" },
      body: JSON.stringify({ event: { id: "1", type: "TEST" } }),
    });
    expect(res.status).toBe(404);
  });
});

describe("RevenueCat helpers", () => {
  it("stores, users, amounts and the confirmation match", () => {
    expect([storeSource("APP_STORE"), storeSource("PLAY_STORE"), storeSource("STRIPE")]).toEqual([
      "app_store",
      "play_store",
      null,
    ]);
    const e = purchase("u1", { aliases: ["$RCAnonymousID:x", "u1", "u0"], original_app_user_id: "u0" });
    expect(candidateUserIds(e)).toEqual(["u1", "u0"]);
    expect(amountIdrOf(e)).toBe(149000);
    expect(amountIdrOf({ ...e, currency: "USD", price_in_purchased_currency: 9.99 })).toBe(0);
    const byTime = {
      subscriber: {
        non_subscriptions: {
          test_product_3m: [
            { store: "app_store", purchase_date: new Date((e.purchased_at_ms ?? 0) + 30_000).toISOString() },
          ],
        },
      },
    };
    expect(purchaseConfirmed(byTime, e)).toBe(true);
    expect(purchaseConfirmed(holding({ ...e, transaction_id: "other" }), e)).toBe(false);
  });
});
