import { env } from "cloudflare:workers";
import {
  expirePendingPayments,
  FakeProvider,
  handleWebhook,
  paymentStatus,
  startCheckout,
} from "@factory/core/billing";
import { hasAccess } from "@factory/core/entitlements";
import { entitlements, payments, schema, webhookEvents } from "@factory/db";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { beforeEach, describe, expect, it } from "vitest";

// Section 6 required tests, provider-agnostic (FakeProvider), against real local D1.
const db = drizzle(env.DB, { schema });
const plans = [
  { id: "6m", label: "6 bulan", months: 6, priceIdr: 149000 },
  { id: "12m", label: "12 bulan", months: 12, priceIdr: 249000 },
];
const NOW = new Date("2026-10-11T00:00:00Z");

let provider: FakeProvider;
let user: { id: string; name: string; email: string };
beforeEach(() => {
  provider = new FakeProvider();
  const id = `user-${crypto.randomUUID()}`;
  user = { id, name: "Budi", email: `${id}@example.com` };
});

const checkout = (planId = "6m") =>
  startCheckout(db, provider, {
    user,
    plan: plans.find((p) => p.id === planId) as (typeof plans)[number],
    methods: ["QRIS"],
    origin: "https://app.example",
    now: NOW,
  });

describe("checkout", () => {
  it("records a pending payment before redirecting to the provider", async () => {
    const { paymentId, redirectUrl } = await checkout("12m");
    expect(redirectUrl).toContain(paymentId);
    const row = await db.select().from(payments).where(eq(payments.id, paymentId)).get();
    expect(row).toMatchObject({
      status: "pending",
      amountIdr: 249000,
      planId: "12m",
      providerRef: `FAKE-${paymentId}`,
    });
    expect(provider.checkouts[0]).toMatchObject({
      callbackUrl: "https://app.example/api/webhooks/fake",
      successUrl: `https://app.example/billing/return?paymentId=${paymentId}`,
    });
  });
});

describe("webhook", () => {
  it("rejects a bad signature without touching the payment", async () => {
    const { paymentId } = await checkout();
    const outcome = await handleWebhook(db, provider, provider.webhook(paymentId, "paid", "e1", "wrong"), plans, NOW);
    expect(outcome.kind).toBe("unauthorized");
    expect((await db.select().from(payments).where(eq(payments.id, paymentId)).get())?.status).toBe("pending");
  });

  it("grants access once on a confirmed payment, even when the webhook is replayed", async () => {
    const { paymentId } = await checkout();
    const req = () => provider.pay(paymentId, "evt-1");
    const first = await handleWebhook(db, provider, req(), plans, NOW);
    expect(first.kind).toBe("processed");
    if (first.kind === "processed") expect(first.entitlement?.expiresAt.toISOString()).toBe("2027-04-11T00:00:00.000Z");

    const replay = await handleWebhook(db, provider, req(), plans, NOW);
    expect(replay.kind).toBe("duplicate");
    const another = await handleWebhook(db, provider, provider.pay(paymentId, "evt-2"), plans, NOW);
    expect(another).toMatchObject({ kind: "ignored", reason: "already paid" });

    expect(await db.select().from(entitlements).where(eq(entitlements.paymentId, paymentId))).toHaveLength(1);
    expect(await hasAccess(db, user.id, NOW)).toBe(true);
    expect((await db.select().from(payments).where(eq(payments.id, paymentId)).get())?.status).toBe("paid");
  });

  it("doesn't trust a 'paid' callback the provider hasn't confirmed, and asks for a retry", async () => {
    const { paymentId } = await checkout();
    const outcome = await handleWebhook(db, provider, provider.webhook(paymentId, "paid", "evt-lag"), plans, NOW);
    expect(outcome).toEqual({ kind: "retry" });
    expect(await hasAccess(db, user.id, NOW)).toBe(false);

    // The provider's retry (same event) is processed once the status API confirms.
    provider.statuses.set(paymentId, "paid");
    const retried = await handleWebhook(db, provider, provider.webhook(paymentId, "paid", "evt-lag"), plans, NOW);
    expect(retried.kind).toBe("processed");
    expect(await hasAccess(db, user.id, NOW)).toBe(true);
  });

  it("ignores non-paid callbacks while the provider still says pending", async () => {
    const { paymentId } = await checkout();
    const outcome = await handleWebhook(db, provider, provider.webhook(paymentId, "failed"), plans, NOW);
    expect(outcome).toMatchObject({ kind: "ignored", reason: "still pending at provider" });
    expect((await db.select().from(payments).where(eq(payments.id, paymentId)).get())?.status).toBe("pending");
  });

  it("marks failed payments without granting", async () => {
    const { paymentId } = await checkout();
    provider.statuses.set(paymentId, "failed");
    const outcome = await handleWebhook(db, provider, provider.webhook(paymentId, "failed"), plans, NOW);
    expect(outcome.kind).toBe("processed");
    expect((await db.select().from(payments).where(eq(payments.id, paymentId)).get())?.status).toBe("failed");
    expect(await hasAccess(db, user.id, NOW)).toBe(false);
  });

  it("ignores webhooks for unknown payments", async () => {
    const outcome = await handleWebhook(db, provider, provider.pay("pay_unknown"), plans, NOW);
    expect(outcome).toMatchObject({ kind: "ignored", reason: "unknown payment" });
    const events = await db.select().from(webhookEvents).where(eq(webhookEvents.status, "unknown_payment"));
    expect(events.length).toBeGreaterThan(0);
  });
});

describe("expiry cron and status polling", () => {
  it("expires pending payments past their expiry, not paid ones", async () => {
    const pending = await checkout();
    const paid = await checkout();
    await handleWebhook(db, provider, provider.pay(paid.paymentId), plans, NOW);
    const count = await expirePendingPayments(db, new Date(NOW.getTime() + 61 * 60_000));
    expect(count).toBeGreaterThanOrEqual(1);
    expect((await db.select().from(payments).where(eq(payments.id, pending.paymentId)).get())?.status).toBe("expired");
    expect((await db.select().from(payments).where(eq(payments.id, paid.paymentId)).get())?.status).toBe("paid");
  });

  it("lets only the owner read a payment's status", async () => {
    const { paymentId } = await checkout();
    expect(await paymentStatus(db, user.id, paymentId)).toMatchObject({ status: "pending" });
    expect(await paymentStatus(db, "someone-else", paymentId)).toBeNull();
  });
});
